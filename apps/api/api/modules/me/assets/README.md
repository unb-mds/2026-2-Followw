Imagens do cabeçalho do atestado, copiadas sem alterações do SIGAA da UnB:

- `unb.gif`: https://sigaa.unb.br/shared/img/instituicao/ufrn.gif
- `sti.gif`: https://sigaa.unb.br/shared/img/instituicao/sinfo.gif

O caminho legado `ufrn.gif` contém a marca da UnB. As imagens ficam no pacote para
reproduzir o cabeçalho sem downloads durante a geração do PDF.

`followw-sans.ttf` e `followw-sans-bold.ttf` são derivados das fontes livres Vera
incluídas no ReportLab, renomeados conforme `FONT-LICENSE.txt`. Os avanços
horizontais seguem as medidas da Verdana para reproduzir as quebras de linha
do SIGAA. O desenho do `I` maiúsculo recebeu barras horizontais para evitar a
aparência de letra partida. Essa família é apenas a alternativa aproximada para
ambientes sem a Verdana original. Nenhum arquivo de fonte Verdana é distribuído.

`verdana-advances.json` contém apenas as medidas de avanço, em milésimos de em,
dos caracteres presentes nas fontes livres, medidas nas fontes de referência
`verdana.ttf` e `verdanab.ttf` instaladas no Windows. Para reconstruir os TTFs:

```sh
uv run --no-sync --with fonttools python apps/api/scripts/build_certificate_fonts.py
```

fontTools só participa dessa preparação local; não é dependência de produção.

`verdana-smallcaps.json` contém IDs de glifos, avanços, kerning e hashes para usar
as versaletes da Verdana instalada, sem copiar ou redesenhar seus contornos. A API
carrega os TTFs originais do Windows ou de `SIGAA_PDF_FONT_DIR`. Uma versão distinta
da fonte precisa de seu próprio JSON, gerado por `scripts/read_verdana_metrics.py`.
Os TTFs da Verdana exigem fornecimento e licença adequados para uso no servidor.
