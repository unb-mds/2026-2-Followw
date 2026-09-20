CAS_BASE_URL = "https://autenticacao.unb.br"
CAS_LOGIN_URL = f"{CAS_BASE_URL}/sso-server/login"

CAS_SERVICE_URL = "https://sig.unb.br/sigaa/login/cas"

SIGAA_BASE_URL = "https://sigaa.unb.br"
SIGAA_COOKIE_DOMAIN = "sigaa.unb.br"

SESSION_COOKIE_NAME = "JSESSIONID"

DASHBOARD_PATH = "/sigaa/portais/discente/discente.jsf"
CLASSROOMS_PATH = "/sigaa/portais/discente/turmas.jsf"
PARTICIPANTS_PATH = "/sigaa/ava/participantes.jsf"
LOGOUT_PATH = "/sigaa/logar.do?dispatch=logOff"

PUBLIC_HOME_PATH = "/sigaa/public/home.jsf"
PUBLIC_CLASSROOMS_PATH = "/sigaa/public/turmas/listar.jsf"

DEFAULT_TIMEOUT = 15

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
)
