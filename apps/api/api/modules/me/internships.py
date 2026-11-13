from sigaa_client import Internship, InternshipSummary, lookup_key


class InternshipItem(InternshipSummary):
    """Resumo de uma vaga de estágio no mural."""

    is_my_course: bool

    @classmethod
    def from_summary(cls, summary: InternshipSummary) -> InternshipItem:
        return cls(
            **summary.model_dump(),
            is_my_course=summary.reference.startswith("listagem_meu_curso:"),
        )


class InternshipDetail(Internship):
    """Detalhes completos de uma oferta de estágio."""

    reference: str
    is_my_course: bool

    @classmethod
    def from_internship(
        cls, internship: Internship, reference: str
    ) -> InternshipDetail:
        return cls(
            **internship.model_dump(),
            reference=reference,
            is_my_course=reference.startswith("listagem_meu_curso:"),
        )


def filter_internships(
    items: list[InternshipSummary], q: str | None
) -> list[InternshipItem]:
    """Filtra resumos pelo termo de busca e converte para itens com is_my_course."""
    terms = lookup_key(q).split() if q else []
    return [
        InternshipItem.from_summary(item)
        for item in items
        if not terms or all(term in lookup_key(item.title) for term in terms)
    ]
