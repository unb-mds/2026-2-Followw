# Atestado de matrícula

`POST /me/enrollment-certificate` entrega `atestado-matricula.pdf` no perfil, com
`application/pdf`, cookies renovados e `Cache-Control: no-store`. O documento não
é persistido nem usa o cache de turmas. Não requer alterações no banco.

O SIGAA emite HTML, diferente dos PDFs originais da carteirinha e do histórico.
O `sigaa-client` faz GET do portal e POST do menu com ViewState novo e a ação
`portalDiscente.atestadoMatriculaUnb`. O parser retorna `EnrollmentCertificate`.
A API gera sua representação em PDF com ReportLab, mantendo a data e o texto de
verificação da emissão e o rodapé do SIGAA. O criador do PDF fica identificado
nos metadados como Followw.

A resposta já contém o HTML completo; o parser entrega os dados estruturados ao
renderizador. As folhas CSS externas não são baixadas por emissão. A calibração
local usa `atestado_matricula.css`, `ufrn_relatorio.css` e `ufrn_print.css`, incluindo
os espaços entre elementos inline. ReportLab não executa o layout CSS de um navegador.

O layout segue as dimensões e os estilos de impressão do SIGAA: cabeçalho com
as marcas UnB/STI, identificação em quatro colunas, docentes em tamanho menor,
grade com cabeçalho cinza, separadores vazios e autenticação destacada em vermelho.
As duas imagens originais são incluídas no pacote e somam 2.487 bytes. No Windows,
a renderização usa a Verdana original instalada, incluindo os I maiúsculos,
versaletes nativas e o kerning dos títulos e textos comuns. O afastamento de Local usa os 15 px
do CSS original, além do espaço entre os spans.
A API também reproduz a faixa de impressão com data/hora, título, URL e numeração
de páginas. A data superior é a da geração do PDF em `America/Sao_Paulo`; a data
de emissão no cabeçalho e o código de autenticação continuam sendo os do SIGAA.
O PDF preserva o rodapé recebido do SIGAA, inclusive o servidor da emissão
(por exemplo, `app14.sigaa14`), sem substituí-lo por um nó fixo.
O tamanho da página é 594,96 × 841,92 pt, conforme o A4 salvo pelo Chromium.
As larguras das colunas usam as medidas mínimas e máximas do conteúdo, em frações
de pixel CSS, para acompanhar a distribuição automática do navegador. As
bordas seguem a grade de pixels CSS. A faixa do navegador usa Arial quando disponível.
Os avanços entre trechos inline arredondam para 1/64 de pixel CSS. A faixa segue
o [template do Chromium](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/printing/resources/print_header_footer_template_page.html):
o título se centraliza no espaço restante após a data/hora, e a numeração preserva
os avanços separados de página, barra e total.

Aviso, autenticação e rodapé institucional são mantidos juntos na paginação; quando
não cabem no espaço restante, o bloco passa para a página seguinte. A autenticação
também alinha a origem de cada linha à grade CSS, considerando separadamente seus
trechos normais e negritos, sem alterar fontes, dados da emissão ou quebras de linha.

A grade é preenchida por atribuições JavaScript no HTML original. O parser lê
somente o padrão literal observado, sem executar código. Estrutura inesperada,
quantidade divergente ou grade não preenchida resultam em erro 502. Atividades,
incluindo monitoria, usam a mesma tabela das turmas: `activity_count` preserva a
contagem separada, e a soma é validada contra as linhas recebidas. O PDF inclui
o orientador, a forma de participação e o segundo título quando há atividades.
A renderização roda fora do event loop, limitada a um documento por processo,
com imports tardios.

## Verdana original

`SIGAA_PDF_FONT_DIR` aponta para um diretório com `verdana.ttf`, `verdanab.ttf` e
`verdana-smallcaps.json`. No Windows, a pasta Fonts é detectada automaticamente.
O diretório também pode conter `arial.ttf` para a faixa de impressão. O mesmo
script inclui seu hash e kerning no JSON; sem Arial, essa faixa usa Helvetica.
O JSON empacotado corresponde à versão de referência instalada nesta máquina;
o hash dos arquivos é conferido antes de usar os IDs de glifos. Para outra versão,
gere seu próprio JSON no diretório das fontes:

```sh
uv run --no-sync --with fonttools python apps/api/scripts/read_verdana_metrics.py FONT_DIR FONT_DIR/verdana-smallcaps.json
```

O script lê apenas os IDs, avanços, kerning e hashes; não copia desenhos de letras.
fontTools só é usado nessa preparação, sem dependência adicional em produção.
Sem Verdana instalada ou configurada, a API usa a aproximação livre Followw Sans;
essa alternativa não tem fidelidade tipográfica idêntica ao SIGAA.

A Verdana e a Arial não são incluídas no repositório. Para produção Linux/Vercel, disponibilize
os arquivos com direitos de uso no servidor e configure o diretório. A licença do
Windows distingue a incorporação no PDF da redistribuição da fonte no servidor:
[FAQ da Microsoft](https://learn.microsoft.com/en-us/typography/fonts/font-faq).

## Escolha do gerador

PyPDF2/pypdf manipula PDFs existentes; conversão de HTML e geração desse relatório
não fazem parte de seu escopo. Montar streams PDF manualmente com ele exigiria
implementar fontes, quebra de linha e paginação.

Comparação local em Windows, Python 3.14, com oito linhas equivalentes, fontes
Helvetica e 50 gerações por biblioteca; cada biblioteca foi medida em um processo:

| Biblioteca | Importação | Mediana | P95 | Aumento de RSS após o ensaio | Pacote instalado |
|---|---:|---:|---:|---:|---:|
| ReportLab 5.0.1 | 752 ms | 4,19 ms | 4,65 ms | 16,3 MiB | 4,45 MiB |
| fpdf2 2.8.9 | 1855 ms | 10,06 ms | 11,57 ms | 44,2 MiB | 1,41 MiB + fontTools 11,58 MiB + defusedxml |

São ensaios locais de tabelas, não uma comparação universal dos motores. Pillow
e charset-normalizer já existem nas dependências de produção do Followw.

Ensaio local em 23/10/2026 com Verdana e Arial originais incorporadas,
identificação, oito matrículas fictícias e grade semanal: PDF de 137.513 bytes
em uma página, sem dependências novas de produção:

- Primeira geração, incluindo importação tardia: 214,81 ms.
- 50 gerações seguintes: mediana de 32,72 ms, P95 de 35,57 ms.
- Aumento de RSS entre antes da primeira geração e depois do ensaio: 20,96 MiB.
- RSS ao final: 91,93 MiB; inclui os imports desse processo de benchmark.

Os dois TTFs empacotados somam 124.800 bytes e dispensam fontTools em produção.

RSS não representa alocação máxima por requisição; os valores variam por sistema.
Para repetir sem rede nem dados pessoais durante o ensaio:

```sh
uv run --with psutil python apps/api/scripts/benchmark_enrollment_certificate.py
```

`--output caminho.pdf` grava uma amostra com dados fictícios. O script não faz
parte do caminho de produção e `psutil` não é uma dependência da API.

## Vercel Hobby

Consulta à documentação em 20/10/2026, para Functions com Fluid Compute:

| Limite | Valor documentado |
|---|---:|
| Memória | 2 GB / 1 vCPU |
| Duração | 300 segundos |
| Bundle Python descompactado | 500 MB |
| Corpo da resposta | 4,5 MB |

Foram instaladas as dependências de produção exportadas pelo uv, sem os pacotes
locais do workspace, em um diretório isolado para Linux x86_64/manylinux_2_28,
Python 3.14: total de 158,54 MiB, com 4,43 MiB no diretório `reportlab`.
Isso verifica disponibilidade de wheels e estima o tamanho das dependências;
não é o bundle final produzido pela Vercel nem uma execução em Linux.

A implementação cabe nesses limites pelas medições disponíveis e não depende
de Chromium ou binários de impressão. A fidelidade em Verdana depende do
fornecimento das fontes conforme a configuração acima. Antes de publicar,
conferir o tamanho final do bundle e fazer uma emissão autenticada no preview.
O tempo total inclui login e latência do SIGAA, que não entram no benchmark.
Projetos com Fluid Compute desativado possuem limites de duração diferentes.

Não há necessidade técnica identificada de mudar de hospedagem. Se a verificação
no preview encontrar um impedimento, as alternativas são:

| Alternativa | Quando considerar | Custo |
|---|---|---|
| PDF no navegador com jsPDF | Se a API só puder retornar os dados do relatório | Transfere renderização ao dispositivo; a API deixa de entregar PDF diretamente |
| HTML com impressão do navegador | Se um passo manual de salvar for aceitável | Poucas dependências; não satisfaz o download direto pedido |
| WeasyPrint | Se for necessário aproximar o CSS original | Exige tratar o JavaScript da grade e dependências nativas |
| Serviço externo de renderização | Se a fidelidade de um navegador for indispensável | Nova infraestrutura, latência e circulação dos dados pessoais |

Referências:

- [Escopo do pypdf](https://pypdf.readthedocs.io/en/stable/meta/scope-of-pypdf.html)
- [Tabelas do ReportLab](https://docs.reportlab.com/reportlab/userguide/ch7_tables/)
- [Dependências do fpdf2](https://py-pdf.github.io/fpdf2/)
- [Limites das Vercel Functions](https://vercel.com/docs/functions/limitations)
- [Runtime Python da Vercel](https://vercel.com/docs/functions/runtimes/python)
