MENU = """
<form id="menu:form_menu_discente" action="/sigaa/portais/discente/discente.jsf">
  <input type="hidden" name="menu:form_menu_discente" value="menu:form_menu_discente">
  <input type="hidden" name="id" value="">
  <input type="hidden" name="jscook_action" value="">
  <input type="hidden" name="javax.faces.ViewState" value="VS1">
</form>
"""
LISTAGEM = """
<div id="conteudo">
  <h2><a>Portal Discente</a> &gt; Lista de Avaliações Institucionais</h2>
  <form id="form" action="/sigaa/avaliacao/calendario/lista.jsf">
    <input type="hidden" name="javax.faces.ViewState" value="VS-lista">
    <table class="formulario">
      <caption>Lista de Avaliações Institucionais</caption>
      <thead><tr>
        <td>Ano-Período</td><td>Formulário</td><td>Perfil Entrevistado</td>
        <td>Ensino à Distância</td><td>Período de Resposta</td><td></td>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </form>
</div>
"""
LINHA = """
<tr>
  <td>2026.2</td><td>AVALIAÇÃO DOCENTE PELO DISCENTE</td>
  <td>DISCENTE DE GRADUAÇÃO</td><td>Não</td><td>19/11/2026 a 31/01/2027</td>
  <td><a id="form:responder" onclick="jsfcljs(f,{'form:responder':'form:responder','id':'123'},'');">
    <img title="Preencher Avaliação Institucional">
  </a></td>
</tr>
"""

INTRO = """
<div id="conteudo">
  <h2>Avaliação Institucional</h2>
  <form id="intro" action="/sigaa/avaliacao/introDiscente.jsf">
    <input name="javax.faces.ViewState" value="VS-intro">
    <a onclick="jsfcljs(f,{'intro:abrir':'intro:abrir'},'');">Preencher Avaliação</a>
  </form>
</div>
"""
QUESTIONARIO = """
<div id="conteudo">
  <form id="form" name="form" action="/sigaa/avaliacao/discente.jsf">
    <input type="hidden" name="form" value="form">
    <input type="hidden" name="aba" value="1">
    <input type="hidden" name="javax.faces.ViewState" value="VS-quiz">
    <h2>Portal Discente &gt; Questionário da Avaliação da Docência pelo Aluno</h2>
    <div class="descricaoOperacao"><p>Avalie a docência.</p></div>
    <div id="dimensoes-avaliacao-100">
      <div class="aba">
        <table class="turma"><tr><td></td>
          <td><a onclick="PainelTurma.show(10)" title="123 - Ana">FGA0001 - T01</a></td>
          <td></td>
        </tr></table>
        <table><tr class="pergunta">
          <td>O plano de ensino foi apresentado.</td>
          <td><select name="p_1_10">
            <option value=""></option><option selected>10</option><option value="-1">N/A</option>
          </select></td>
          <td></td>
        </tr></table>
        <h4>Turmas com mais de um professor</h4>
        <table><tr>
          <td><a onclick="PainelTurma.show(20)">FGA0002 - COMPONENTE</a></td>
          <td><acronym title="456 - Bia">Bia</acronym></td>
          <td><acronym title="789 - Carlos">Carlos</acronym></td>
        </tr></table>
        <table><tr class="pergunta">
          <td>O plano de ensino foi apresentado.</td>
          <td><select name="p_1_20"><option value=""></option><option value="9" selected>9</option><option value="-1">N/A</option></select></td>
          <td><select name="p_1_21"><option value=""></option><option value="10">10</option><option value="-1">N/A</option></select></td>
        </tr></table>
      </div>
    </div>
    <div id="comentario">
      <table><tr><td><input type="checkbox">FGA0002 - Bia, Carlos
        <div><select name="opcao_tmd_20"><option value="-1">Nenhum</option><option value="20" selected>Bia</option><option value="21">Carlos</option></select>
        <textarea name="obs_tmd_20">Texto de rascunho</textarea></div>
      </td></tr></table>
      <h5>Comentários gerais</h5><textarea name="form:comment"></textarea>
    </div>
    <table class="botoes"><tr><td>
      <input type="image" name="form:icone">
      <a onclick="jsfcljs(f,{'form:salvar':'form:salvar'},'');">Salvar</a>
      <a onclick="jsfcljs(f,{'form:finalizar':'form:finalizar'},'');">Finalizar</a>
    </td></tr></table>
  </form>
</div>
"""
