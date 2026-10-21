"""uv run --with psutil python apps/api/scripts/benchmark_enrollment_certificate.py"""

import argparse
import json
import statistics
import time
from pathlib import Path

import psutil
from sigaa_client import EnrollmentCertificate

from api.modules.me.enrollment_certificate import render_enrollment_certificate


def sample_certificate() -> EnrollmentCertificate:
    return EnrollmentCertificate(
        issued_at="20/10/2026 21:52",
        identification=(
            ("Período Letivo", "2026.2 (10/08/2026 à 14/12/2026)"),
            ("Nível", "GRADUAÇÃO"),
            ("Matrícula", "000000000"),
            ("Vínculo", "REGULAR"),
            ("Nome", "JOÃO DA CONCEIÇÃO - EXEMPLO FICTÍCIO"),
            ("Curso", "ENGENHARIA DE SOFTWARE - DIURNO"),
        ),
        enrollment_headers=(
            "Cód.",
            "Componentes Curriculares/Docentes",
            "Turma",
            "Status",
            "Horário",
        ),
        enrollments=tuple(
            (
                f"MAT{i:04d}",
                "CÁLCULO E MÉTODOS\nDOCENTE DE TESTE\nTipo: DISCIPLINA   Local: SALA 1",
                "01",
                "MATRICULADO(A)",
                "24T23 (10/08/2026 - 14/12/2026)",
            )
            for i in range(8)
        ),
        schedule=(
            ("Horários", "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"),
            *tuple(
                (
                    f"{hour:02d}:00 - {hour:02d}:55",
                    "---",
                    "MAT0001",
                    "---",
                    "MAT0001",
                    "---",
                    "---",
                    "---",
                )
                for hour in range(8, 18)
            ),
        ),
        authentication="Para verificar a autenticidade deste documento acesse https://sigaa.unb.br/sigaa/documentos/ informando a matrícula, a data de emissão e o código de verificação 012345abcd. DADOS FICTÍCIOS PARA TESTE.",
        footer="SIGAA | Secretaria de Tecnologia da Informação - STI - (61) 3107-0102 | Copyright © 2006-2026 - UFRN - app-teste",
    )


def main():
    parser = argparse.ArgumentParser(
        description="Mede geração local, sem rede ou credenciais."
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    certificate = sample_certificate()
    process = psutil.Process()
    before = process.memory_info().rss
    started = time.perf_counter()
    pdf = render_enrollment_certificate(certificate)
    cold_ms = (time.perf_counter() - started) * 1000
    elapsed = []
    for _ in range(50):
        started = time.perf_counter()
        render_enrollment_certificate(certificate)
        elapsed.append((time.perf_counter() - started) * 1000)
    memory = process.memory_info()
    print(
        json.dumps(
            {
                "cold_ms": round(cold_ms, 2),
                "warm_median_ms": round(statistics.median(elapsed), 2),
                "warm_p95_ms": round(sorted(elapsed)[47], 2),
                "pdf_bytes": len(pdf),
                "rss_delta_bytes": memory.rss - before,
                "rss_bytes": memory.rss,
                "iterations": 50,
            }
        )
    )
    if args.output:
        args.output.write_bytes(pdf)


if __name__ == "__main__":
    main()
