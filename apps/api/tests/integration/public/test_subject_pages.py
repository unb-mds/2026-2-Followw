import pytest

from api.db.models import Classroom, Subject


@pytest.mark.parametrize("query", [{"q": "álgebra"}, {"unit": "FCTE"}])
def test_ofertas_sao_paginadas_e_incluem_turmas_cheias(client, database, query):
    codes = [f"MAT{index:04d}" for index in range(30)]
    with database.begin() as session:
        session.add_all(
            Subject(code=code, name="ÁLGEBRA", unit_id=673) for code in codes
        )
        session.flush()
        session.add_all(
            Classroom(
                subject_code=code,
                number="01",
                semester="2026.2" if index < 27 else "2026.1",
                vacancies=20,
                occupied=20,
            )
            for index, code in enumerate(codes[:-1])
        )
    for page, expected in [(1, codes[:25]), (2, codes[25:27]), (3, [])]:
        response = client.get(
            "/public/subjects", params={**query, "offered": True, "page": page}
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert (data["total"], data["page"], data["page_size"]) == (27, page, 25)
        assert [item["code"] for item in data["items"]] == expected
        assert all(item["classrooms"][0]["occupied"] == 20 for item in data["items"])
