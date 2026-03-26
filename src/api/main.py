"""
FastAPI application factory, lifespan, and middleware setup.

Startup sequence:
  1. Configure structured logging
  2. Run SQL migrations
  3. Initialise services (budget tracker, executor)
  4. Start APScheduler with all periodic tasks
  5. Register routes + WebSocket endpoint

Shutdown:
  1. Stop APScheduler gracefully
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.shared.config import get_settings
from src.shared.logging import configure_logging
from src.pipeline.db import run_migrations
from src.api import state as app_state
from src.api.routes import battery, pricing, schedule, preferences, profiles, analytics, notifications, health, status
from src.api.websocket import manager, websocket_endpoint

log = structlog.get_logger(__name__)

# Convenience alias — used throughout this module's job functions.
_broadcast = app_state.broadcast


# ─────────────────────────────────────────────────────────────────────────────
# Background task runners (called by APScheduler)
# ─────────────────────────────────────────────────────────────────────────────

def _run_amber_collector():
    settings = get_settings()
    if not settings.amber_api_key or not settings.amber_site_id:
        log.debug("amber_collector: no API key configured, skipping")
        return
    from src.pipeline.amber_collector import AmberCollector
    collector = AmberCollector(
        api_key=settings.amber_api_key,
        site_id=settings.amber_site_id,
        db_path=settings.db_path_obj,
    )
    result = collector.run_once()
    log.info("amber_collector.cycle", status=result.get("status"))

    # Push price update over WebSocket
    if result.get("status") == "success":
        from src.pipeline import analytics
        state = analytics.get_current_state(settings.db_path_obj)
        prices = state.get("prices") or {}
        general = prices.get("general") or {}
        feed_in = prices.get("feedIn") or {}

        spike = general.get("spike_status", "none")
        _broadcast(manager.broadcast_price_update(
            current_per_kwh=general.get("per_kwh", 0.0),
            feed_in_per_kwh=feed_in.get("per_kwh", 0.0),
            descriptor=general.get("descriptor", "neutral"),
            renewables_pct=general.get("renewables"),
        ))
        if spike in ("spike", "potential"):
            _broadcast(manager.broadcast_price_spike(
                current_per_kwh=general.get("per_kwh", 0.0),
                descriptor=general.get("descriptor", "spike"),
                expected_duration_minutes=30,
                action_taken="HOLD",
            ))


def _run_foxess_collector():
    settings = get_settings()
    if not settings.foxess_api_key or not settings.foxess_device_sn:
        log.debug("foxess_collector: no credentials configured, skipping")
        return

    from src.engine.budget import FoxESSBudget
    budget = FoxESSBudget(db_path=settings.db_path)

    from src.pipeline.foxess_collector import FoxESSCollector
    collector = FoxESSCollector(
        api_key=settings.foxess_api_key,
        token=settings.foxess_token,
        device_sn=settings.foxess_device_sn,
        db_path=settings.db_path_obj,
        budget=budget,
    )
    result = collector.run_once()

    if result.get("status") == "success":
        tel = result.get("telemetry", {})
        from src.shared.models import foxess_mode_to_battery_mode
        mode = foxess_mode_to_battery_mode(tel.get("work_mode")).value
        _broadcast(manager.broadcast_battery_update(
            soc=tel.get("bat_soc", 0.0),
            power_w=tel.get("bat_power_w", 0.0),
            mode=mode,
            solar_w=tel.get("pv_power_w", 0.0),
            load_w=tel.get("load_power_w", 0.0),
            grid_w=tel.get("grid_power_w", 0.0),
            temperature=tel.get("bat_temp_c"),
        ))
    elif result.get("status") == "failed":
        _broadcast(manager.broadcast_system_alert(
            severity="warning",
            message=f"FoxESS telemetry failed: {result.get('error', 'unknown error')}",
        ))


def _run_solar_collector():
    settings = get_settings()
    from src.pipeline.solar_forecast_collector import SolarForecastCollector
    collector = SolarForecastCollector(
        latitude=settings.site_latitude,
        longitude=settings.site_longitude,
        panel_capacity_w=settings.panel_capacity_w,
        system_efficiency=settings.panel_efficiency,
        db_path=settings.db_path_obj,
    )
    result = collector.run_once()
    log.info("solar_collector.cycle", status=result.get("status"))


def _run_aggregation():
    settings = get_settings()
    from src.pipeline.aggregator import Aggregator
    agg = Aggregator(db_path=settings.db_path_obj)
    result = agg.run_all()
    log.debug("aggregator.cycle", **result)


def _run_decision_engine():
    settings = get_settings()
    try:
        from src.pipeline import analytics
        from src.engine import profiles as profile_engine, optimizer, scheduler as sched
        from src.pipeline.db import get_connection

        context = analytics.get_optimization_context(settings.db_path_obj)

        conn = get_connection(settings.db_path_obj)
        try:
            resolution = profile_engine.resolve_active_profile(conn)
        finally:
            conn.close()

        schedule_slots = optimizer.generate_schedule(
            context=context,
            active_profile=resolution,
            base_min_soc=settings.bat_min_soc,
        )
        savings = optimizer.estimate_daily_savings(
            schedule_slots,
            current_soc=context.get("current_soc") or 50.0,
            bat_capacity_kwh=settings.bat_capacity_kwh,
        )
        app_state.set_schedule(schedule_slots, savings)

        action_info = sched.get_current_action(schedule_slots)
        _broadcast(manager.broadcast_schedule_update(
            action=action_info["current_action"],
            is_override=action_info["is_override"],
            next_change_at=action_info["next_change_at"],
            next_action=action_info["next_action"],
        ))

        # Execute current action on inverter
        executor = app_state.get_executor()
        if executor:
            executor.execute_action(action_info["current_action"])

        log.info(
            "decision_engine.cycle",
            action=action_info["current_action"],
            slots=len(schedule_slots),
            profile=resolution.get("source"),
        )

    except Exception as exc:
        log.error("decision_engine.cycle.failed", error=str(exc), exc_info=True)
        _broadcast(manager.broadcast_system_alert(
            severity="warning",
            message=f"Decision engine error: {exc}",
        ))


def _run_retention_cleanup():
    """Delete raw/bronze data older than 90 days."""
    settings = get_settings()
    from src.pipeline.db import transaction
    with transaction(settings.db_path_obj) as conn:
        conn.execute(
            "DELETE FROM raw_amber_prices WHERE ingested_at < datetime('now', '-90 days')"
        )
        conn.execute(
            "DELETE FROM raw_foxess_telemetry WHERE ingested_at < datetime('now', '-90 days')"
        )
        conn.execute(
            "DELETE FROM raw_solar_forecasts WHERE ingested_at < datetime('now', '-90 days')"
        )
    log.info("retention_cleanup.done")


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app_state.set_event_loop(asyncio.get_running_loop())

    settings = get_settings()
    configure_logging(
        log_level=settings.log_level,
        json_logs=settings.is_production,
    )
    log.info("battery_brain.starting", environment=settings.environment, version=settings.version)

    # Apply DB migrations
    run_migrations(settings.db_path_obj)
    log.info("migrations.done")

    # Initialise executor
    if settings.foxess_api_key and settings.foxess_device_sn:
        from src.engine.budget import FoxESSBudget
        from src.engine.executor import FoxESSExecutor
        import foxesscloud.openapi as f
        f.api_key = settings.foxess_api_key
        f.token = settings.foxess_token
        f.device_sn = settings.foxess_device_sn
        budget = FoxESSBudget(db_path=settings.db_path)
        executor = FoxESSExecutor(device_sn=settings.foxess_device_sn, budget=budget)
        app_state.set_executor(executor)

    # Start APScheduler
    scheduler = BackgroundScheduler(timezone="UTC")

    # Telemetry (3 min default)
    scheduler.add_job(
        _run_foxess_collector,
        "interval",
        seconds=settings.foxess_poll_interval_sec,
        id="foxess_telemetry",
        next_run_time=datetime.now(timezone.utc),
    )

    # Prices (5 min)
    scheduler.add_job(
        _run_amber_collector,
        "interval",
        seconds=settings.amber_poll_interval_sec,
        id="amber_prices",
        next_run_time=datetime.now(timezone.utc),
    )

    # Solar forecast (60 min)
    scheduler.add_job(
        _run_solar_collector,
        "interval",
        seconds=settings.solar_poll_interval_sec,
        id="solar_forecast",
        next_run_time=datetime.now(timezone.utc),
    )

    # Aggregation (after each collection cycle ~5 min)
    scheduler.add_job(_run_aggregation, "interval", minutes=5, id="aggregation")

    # Decision engine (15 min)
    scheduler.add_job(
        _run_decision_engine,
        "interval",
        seconds=settings.decision_engine_interval_sec,
        id="decision_engine",
        next_run_time=datetime.now(timezone.utc),
    )

    # Daily analytics aggregation
    scheduler.add_job(_run_aggregation, "cron", hour=0, minute=5, id="daily_aggregation")

    # Retention cleanup
    scheduler.add_job(_run_retention_cleanup, "cron", hour=2, minute=0, id="retention_cleanup")

    scheduler.start()
    log.info("scheduler.started", jobs=len(scheduler.get_jobs()))

    yield

    scheduler.shutdown(wait=False)
    log.info("battery_brain.shutdown")


# ─────────────────────────────────────────────────────────────────────────────
# App factory
# ─────────────────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Battery Brain",
        description="Home battery management system API",
        version=settings.version,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else ["http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Global error handler
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        log.error("unhandled_exception", path=str(request.url), error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}},
        )

    # Register routers under /api/v1
    prefix = "/api/v1"
    app.include_router(health.router)  # /health — no prefix, no auth
    app.include_router(status.router, prefix=prefix)
    app.include_router(battery.router, prefix=prefix)
    app.include_router(pricing.router, prefix=prefix)
    app.include_router(schedule.router, prefix=prefix)
    app.include_router(preferences.router, prefix=prefix)
    app.include_router(profiles.router, prefix=prefix)
    app.include_router(analytics.router, prefix=prefix)
    app.include_router(notifications.router, prefix=prefix)

    # WebSocket endpoint
    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket, token: str | None = None):
        await websocket_endpoint(websocket, token=token, api_key=settings.api_key)

    return app


# Module-level app instance (used by uvicorn)
app = create_app()
