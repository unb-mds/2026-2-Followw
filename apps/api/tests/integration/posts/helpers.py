from pydantic import SecretStr
from sigaa_client import ClassroomPost, Credentials, News

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha123"))
DETAIL_PATH = "/classrooms/123/posts/news:1"
DETAIL_PATHS = [DETAIL_PATH]
PATHS = ["/posts", "/classrooms/123/posts", DETAIL_PATH]


def _fetch(stub, path):
    if path in DETAIL_PATHS:
        return stub.classrooms.get_classroom_news
    return (
        stub.classrooms.list_dashboard_posts
        if path == "/posts"
        else stub.classrooms.list_classroom_posts
    )


def _post(**kwargs):
    return ClassroomPost.from_news(News(**kwargs))


def mark_read(client, post, classroom_id="123"):
    return client.put(
        f"/classrooms/{classroom_id}/posts/{post['id']}/read",
    )
