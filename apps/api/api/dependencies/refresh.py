from typing import Annotated

from fastapi import Query

RefreshQuery = Annotated[
    bool,
    Query(
        description="Ignora o cache: busca no SIGAA e atualiza o cache antes de responder."
    ),
]
