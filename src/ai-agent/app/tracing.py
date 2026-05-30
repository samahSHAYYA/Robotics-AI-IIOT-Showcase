"""
@author: Samah SHAYYA
@date: 30-May-2026

@description: OpenTelemetry distributed tracing setup for ai-agent.

Feature 45: Configures the OTLP span exporter, FastAPI auto-instrumentation,
and HTTPX client instrumentation so all request flows are captured and
forwarded to Jaeger (or any OTLP-compatible backend).
"""

import os

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

OTEL_ENDPOINT = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317')
OTEL_SERVICE_NAME = os.getenv('OTEL_SERVICE_NAME', 'ai-agent')


def setup_tracing(app):
    """Configure OpenTelemetry tracing for the FastAPI application.

    Creates a TracerProvider with a BatchSpanProcessor pointing to the OTLP
    gRPC endpoint, then instruments both FastAPI and HTTPX to automatically
    propagate trace context across service boundaries.

    @param app: The FastAPI application instance to instrument.
    """
    provider = TracerProvider()
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=OTEL_ENDPOINT))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
