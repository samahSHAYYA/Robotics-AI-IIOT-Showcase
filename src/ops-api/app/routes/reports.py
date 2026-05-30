"""
@author: generated
@date: 30-May-2026

@description: REST endpoint for PDF report generation using ReportLab.
"""

import io
import logging

from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.store import store

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

router: APIRouter = APIRouter(prefix='/api/v1/reports')
logger: logging.Logger = logging.getLogger(__name__)


@router.get('/pdf')
async def generate_pdf_report():
    """
    Generates and returns a PDF report with factory status summary,
    per-robot status table, and recent alerts.

    @return response: StreamingResponse with application/pdf content-type.
    """

    if not REPORTLAB_AVAILABLE:
        return {
            'error': 'ReportLab is not installed. '
                     'Install with: pip install reportlab',
        }

    snapshot = store.get_snapshot()
    timestamp = datetime.now(timezone.utc)
    timestamp_str = timestamp.strftime('%Y%m%d_%H%M%S')
    filename = f'factory-report-{timestamp_str}.pdf'

    buf = io.BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        title=f'Factory Status Report - {timestamp.isoformat()}',
        author='Ops API',
    )

    styles = getSampleStyleSheet()
    story = []

    # ---- Title ----
    title = Paragraph(
        f'Factory Status Report - {timestamp.isoformat()}',
        styles['Title'],
    )
    story.append(title)
    story.append(Spacer(1, 12 * mm))

    # ---- KPI Summary ----
    robots = snapshot.get('robots', [])
    alerts = snapshot.get('alerts', [])
    throughput = snapshot.get('throughput', 0)
    defect_rate = snapshot.get('defect_rate_pct', 0.0)
    uptime = snapshot.get('robot_uptime_pct', 0.0)

    active = sum(1 for r in robots
                 if r.get('status') in ('active', 'moving'))
    idle = sum(1 for r in robots if r.get('status') == 'idle')
    error = sum(1 for r in robots if r.get('status') == 'error')
    critical_count = sum(1 for a in alerts
                         if a.get('severity') == 'critical')

    # OEE: Availability * Performance * Quality (simplified)
    availability = uptime / 100.0
    quality = (100.0 - defect_rate) / 100.0
    performance = active / max(len(robots), 1)
    oee = round(availability * quality * performance, 2)

    story.append(Paragraph('KPI Summary', styles['Heading2']))
    story.append(Spacer(1, 4 * mm))

    kpi_data = [
        ['Metric', 'Value'],
        ['Active Robots', str(active)],
        ['Idle Robots', str(idle)],
        ['Error Robots', str(error)],
        ['Total Robots', str(len(robots))],
        ['Overall Uptime', f'{uptime:.1f}%'],
        ['Defect Rate', f'{defect_rate:.1f}%'],
        ['Throughput', f'{throughput:.0f} units/h'],
        ['Critical Alerts', str(critical_count)],
        ['OEE', f'{oee:.2f}'],
    ]

    kpi_table = Table(kpi_data, colWidths=[100 * mm, 60 * mm])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),
         [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 8 * mm))

    # ---- Per-Robot Status Table ----
    story.append(Paragraph('Robot Status', styles['Heading2']))
    story.append(Spacer(1, 4 * mm))

    robot_header = ['ID', 'Name', 'Status', 'Uptime', 'Task']
    robot_rows = [robot_header]
    for r in robots:
        robot_rows.append([
            r.get('robot_id', ''),
            r.get('name', ''),
            r.get('status', ''),
            f"{r.get('uptime_pct', 0.0):.1f}%",
            r.get('current_task') or '-',
        ])

    robot_table = Table(robot_rows,
                        colWidths=[30 * mm, 45 * mm, 35 * mm, 25 * mm,
                                   55 * mm])
    robot_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2980b9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (3, 0), (3, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),
         [colors.white, colors.HexColor('#ecf0f1')]),
    ]))
    story.append(robot_table)
    story.append(Spacer(1, 8 * mm))

    # ---- Recent Alerts ----
    story.append(Paragraph('Recent Alerts', styles['Heading2']))
    story.append(Spacer(1, 4 * mm))

    if alerts:
        alert_header = ['Severity', 'Message', 'Timestamp']
        alert_rows = [alert_header]
        for a in alerts[:10]:
            sev = a.get('severity', '')
            alert_rows.append([
                sev.capitalize(),
                a.get('message', ''),
                str(a.get('timestamp', ''))[:19],
            ])

        alert_table = Table(alert_rows,
                            colWidths=[35 * mm, 100 * mm, 45 * mm])
        alert_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e74c3c')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1),
             [colors.white, colors.HexColor('#fdf2f2')]),
        ]))
        story.append(alert_table)
    else:
        story.append(Paragraph('No alerts recorded.', styles['Normal']))

    story.append(Spacer(1, 12 * mm))

    # ---- Footer ----
    footer_text = (
        f'Report generated at '
        f'{timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")}'
    )
    story.append(Paragraph(footer_text, styles['Italic']))

    doc.build(story)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type='application/pdf',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
        },
    )
