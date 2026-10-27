# Próxima Vaga

Buscador em português com foco em vagas disponíveis no Brasil. Reúne anúncios públicos de **Glassdoor**, **Indeed**, **Randstad**, **Gupy**, **ProgramaThor** e comunidades brasileiras no GitHub. **InfoJobs**, **Catho** e **LinkedIn** também participam, conforme a disponibilidade pública e a configuração da integração autorizada descritas abaixo. Inclui passagens bíblicas da NVI conferidas nos PDFs fornecidos pelo usuário.

## Executar

Requer **Node.js 24.5 ou superior** e npm. A série 24 está indicada em `.nvmrc`.

```bash
npm ci
npm run dev
```

O mesmo servidor atende o site React e as rotas `/api/jobs` e `/api/health`. A porta padrão é 3000; para alterar: `PORT=4000 npm run dev`.

```bash
npm test
npm run build
npm start
```

`npm start` serve a compilação de produção, gerada antes com `npm run build`.

## Recursos

- Busca por cargo e cidade enviada ao servidor e às fontes conectadas, sem ficar restrita à seleção da página inicial. A interface combina os resultados com filtros sem diferenciar acentos e maiúsculas; cidade/UF também reconhece o estado por extenso.
- Filtro com seleção múltipla de **presencial, híbrido e remoto**, além de **não informado**. Selecionar dois modelos inclui vagas de qualquer um deles.
- Contratos padronizados em português: CLT, PJ, Estágio, Aprendiz, Temporário, Autônomo, Cooperado, Voluntário e Bolsista. Tipos desconhecidos ficam em **Não informado**; jornada integral ou parcial não é interpretada como contrato.
- Filtro por fonte, ordenação, botão para revelar os anúncios carregados e botão **Buscar mais vagas nos sites** para consultar novas páginas, mantendo cargo e cidade. Favoritos persistem no navegador.
- Fonte original em cada anúncio, detalhes e link para consultar a vaga e se candidatar na origem.
- Passagem NVI selecionada por dia no fuso de São Paulo, com botão **Outra passagem**, referência bíblica e página do PDF enviado.
- Interface responsiva, navegação por teclado, estados de carregamento, erro e resultados vazios.

## Fontes e limites

| Fonte | Consulta pública | Seleção |
| --- | --- | --- |
| Glassdoor | Listagem pública e Google Jobs via SerpApi | A consulta de engenharia de software é usada apenas na seleção inicial pública. Pesquisas por cargo/cidade usam o índice autorizado; não se reaproveita essa listagem fixa para outro cargo. |
| Indeed | `br.indeed.com/jobs?q=...&l=...&start=...` e índice autorizado | Cargo e localização reais da pesquisa; até três páginas por lote. Descarta expiradas e anúncios com mais de 180 dias. Não executa scripts nem reutiliza tokens de sessão. |
| Randstad | `randstad.com.br/vagas/q-.../page-.../` e índice autorizado | Até três páginas de 30 anúncios por lote. Cargo enviado ao portal; cidade refinada no filtro e no índice. Cliente não informado não é inventado. |
| InfoJobs | `infojobs.com.br/empregos.aspx?Palabra=...&Page=...` e índice autorizado | Até três páginas por lote. Lê cartões HTML ou anúncios estruturados; bloqueios/erros são sinalizados. |
| Catho e LinkedIn | Google Jobs via SerpApi | Cargo e cidade consultados no índice autorizado, sem automação de áreas restritas dos portais. |
| Gupy | `portal.gupy.io/api/job-search/jobs` | Cargo em `jobName`, cidade em `city`, nome do estado em `state`; até três páginas de 100 anúncios por lote, antes de excluir exterior, banco de talentos e prazos vencidos. Fallback público na primeira página. |
| ProgramaThor | `programathor.com.br/jobs` | Até três páginas por lote, quando disponíveis publicamente. Publicidade ignorada, datas ausentes preservadas. |
| Front-end BR, Back-end BR e React Brasil | Listas públicas de issues no GitHub | Até três páginas por comunidade/lote, com termos da busca, issues abertas e anúncios dos últimos 180 dias. |

`GET /api/jobs?q=garçom&location=Limeira%2C%20SP&page=0` inicia uma pesquisa. `page=1` consulta o próximo lote e retorna os resultados acumulados, deduplicados também entre páginas e fontes. `pagination.hasMore` controla o botão de nova consulta. São permitidos até cinco lotes por pesquisa; cada fonte para quando sua paginação termina ou repete os mesmos anúncios. Uma falha em páginas seguintes preserva as páginas disponíveis e sinaliza consulta parcial.

A busca consulta anúncios **disponíveis publicamente e indexados**, sem prometer todo o catálogo dos portais. Uma publicação recente, restrita ou não indexada pode não aparecer. Há links para repetir cargo e cidade diretamente nos portais. Comunidades podem divulgar trabalho remoto com requisitos próprios de elegibilidade. Confirme a disponibilidade na origem.

Modalidades só são atribuídas com indicação explícita da fonte. Uma cidade informada ou a ausência de indicação de remoto não determina se a vaga é presencial ou híbrida. No GitHub, a modalidade explícita no título tem prioridade sobre rótulos genéricos. Na Gupy, `Efetivo` é apresentado como CLT; outros tipos conhecidos são normalizados, sem transformar cargo, senioridade ou jornada em contrato.

Anúncios podem manter termos originais em seus títulos e descrições. Os filtros e as modalidades são apresentados em português. Os favoritos da versão anterior da Arbeitnow são preservados como **favoritos antigos**, sem participar da nova seleção brasileira.

## Cache e disponibilidade

Cada fonte e cada página têm cache independente em memória por 10 minutos, separado por cargo e cidade. Há limite de 30 pesquisas em memória; o cache não é persistente entre reinícios. Consultas simultâneas compartilham o mesmo carregamento; fontes são consultadas em paralelo. Cada requisição tem prazo de 15 segundos. Uma falha isolada mantém as demais fontes disponíveis e é identificada na interface. Dados antigos em cache são sinalizados; falhas respeitam intervalo de 1 minuto antes de uma nova tentativa.

A disponibilidade depende também do ambiente que faz a consulta. Glassdoor e Indeed responderam no ambiente de desenvolvimento, mas ficaram indisponíveis na primeira validação do Render; Randstad respondeu nos dois. `sources[].failureReason` informa um código seguro de diagnóstico (HTTP, timeout ou falha de formato/rede), sem URL autenticada, credencial ou corpo de erro. Não use troca de identidade, resolução de CAPTCHA ou proxies para contornar recusas dos portais; utilize acesso autorizado quando necessário.

A API retorna HTTP 502 apenas quando não há nenhuma fonte válida, nem cache utilizável. Uma fonte que responde com lista vazia válida continua sendo uma consulta bem-sucedida. Anúncios equivalentes são agrupados pela regra de identidade descrita abaixo; apenas uma origem é exibida por vaga. Não há vagas fictícias para substituir fontes fora do ar.

As fontes públicas verificadas não precisam de chave. O índice opcional requer `SERPAPI_KEY`. Em redes restritas, permita **www.glassdoor.com.br**, **br.indeed.com**, **www.randstad.com.br**, **www.infojobs.com.br**, **portal.gupy.io**, **programathor.com.br** e **github.com**. O provedor opcional usa **serpapi.com**. A instalação usa **registry.npmjs.org**. O suporte nativo a `HTTP_PROXY`, `HTTPS_PROXY` e `NO_PROXY` do Node.js permanece ativo, com validação TLS. Fontes tipográficas e ícones são locais. A antiga rota `portal.api.gupy.io/api/v1/jobs` não é usada.

## Uma vaga, uma origem

`shared/job-identity.js` é usado no servidor e na interface. A comparação considera:

- Identificador oficial e URL canônica, desconsiderando rastreamento e rotas alternativas do mesmo anúncio.
- Empresa normalizada, removendo variações de acentos, pontuação e sufixos jurídicos.
- Cargo normalizado, preservando senioridade e qualificações relevantes, com localização, modalidade e contrato compatíveis.
- Referência da requisição e descrições, quando disponíveis. Referências, cidades, estados, países, modalidades e contratos explicitamente diferentes impedem a fusão.

Anúncios com empregador confidencial ou informação insuficiente não são fundidos só por um cargo genérico. Requisições diferentes dentro do mesmo portal são preservadas. Para Randstad, por ser uma agência que anuncia para vários clientes, é necessária evidência adicional para agrupar entre portais. O agrupamento exige compatibilidade entre todos os membros; um registro incompleto não pode ligar duas vagas incompatíveis.

Escolha da origem: dados atuais têm prioridade sobre cache; depois, informações mais completas. Empates seguem uma ordem estável que prioriza Randstad e Gupy, depois LinkedIn, Indeed, InfoJobs, Catho, Glassdoor e demais fontes. O card e a candidatura usam apenas a origem selecionada. Não são exibidos seis cards nem seis links para a mesma vaga identificada. Favoritos são preservados pelos identificadores e pela mesma regra de equivalência, mesmo se a origem principal mudar.

A API retorna `deduplication.received`, `unique` e `removed`. `sources[].rawCount` é o total consultado; `count` representa apenas vagas únicas selecionadas daquela origem. As regras não conseguem comprovar equivalência quando os portais omitem empresa, localização ou referência e apresentam descrições diferentes; esses casos não são fundidos por suposição.

## Conectar o índice de vagas opcional

A integração com [Google Jobs via SerpApi](https://serpapi.com/google-jobs-api) foi preparada para os seis portais solicitados: Glassdoor, Indeed, InfoJobs, Catho, LinkedIn e Randstad. Ela só usa links diretos de anúncios nos domínios reconhecidos. Um rótulo como “LinkedIn” apontando para outro domínio não é aceito. Anúncios agrupados pelo índice são deduplicados novamente pela aplicação.

O provedor depende de uma chave válida no servidor. Sem chave, as fontes protegidas aparecem como **Conexão pendente**. Consultas que falham aparecem como indisponíveis; credencial presente não é tratada como prova de integração funcionando. Os testes automatizados do provedor usam fixtures explícitas, separadamente das verificações reais no serviço publicado.

Para usar o provedor:

1. Obtenha uma chave em uma conta SerpApi e confira os limites e condições do plano escolhido.
2. Cadastre **SERPAPI_KEY** nas configurações seguras do ambiente para validar durante o desenvolvimento. No site, configure a variável separadamente em **Render → Environment** e reinicie/reimplante o serviço. Salvar o segredo no ambiente Codex não o envia ao Render.
3. Nunca coloque a chave em chat, Git, frontend ou arquivos de instruções. O código não registra URLs autenticadas nem corpos de erro do provedor.
4. Depois de configurar, valide `/api/jobs`: fontes `ok` indicam consulta concluída; contagem zero pode significar ausência de anúncios daquele portal na seleção indexada.

O provedor consulta **duas páginas por lote**, usando `next_page_token` retornado pela própria API; somente o token é aproveitado, nunca uma URL externa autenticada. O cargo e a cidade integram a consulta brasileira. O cache por pesquisa/página dura uma hora e é compartilhado pelos seis portais e pelos visitantes da mesma pesquisa, com até 40 pesquisas em memória. Uma próxima página só é consultada quando há token.

Cada página pode consumir uma consulta do plano SerpApi; uma nova busca ou o botão de expansão pode usar até duas consultas adicionais. Confira a quota do plano. Os resultados indexados complementam os conectores públicos também quando estes respondem, e a deduplicação é aplicada sobre a união das fontes. Isso ainda depende da cobertura e da atualização do Google Jobs e da disponibilidade do provedor.

## AdSense

O snippet fornecido pelo usuário, do editor `ca-pub-7100655819276771`, está no `<head>` de `index.html` e é preservado na compilação de produção. Depois do deploy, o usuário pode marcar **Adicionei o código** e selecionar **Verificar** no painel do AdSense. A confirmação da propriedade e a aprovação do site pertencem ao Google e não são comprovadas apenas pela presença do script. Não foram criados blocos manuais de anúncio nem outro método de verificação.

## Passagens bíblicas

As 30 passagens em `src/verses.js` foram conferidas em `NT-NVI-Pt.pdf` e `AT-NVI-Pt.pdf`, enviados pelo usuário. Cada registro inclui a referência, o nome do documento e a página física do arquivo. A grafia da edição foi preservada; marcas de nota de rodapé, números dos versículos e quebras de linha do PDF não integram o texto mostrado. Os PDFs completos não são publicados nem enviados ao GitHub.

## Testes

- `npm test`: normalização das fontes, localização brasileira, modalidades, contratos, URLs, cache, falhas isoladas, filtros, migração de favoritos, passagens e rotas HTTP.
- `npm run build && npm run test:ui`: inicia e encerra seu próprio servidor de produção para testar os fluxos e a acessibilidade automática no desktop e no celular.

O teste de interface usa Chromium em `/usr/bin/chromium`, quando disponível. Em outro sistema, execute `npx playwright install chromium` ou informe o executável com `CHROMIUM_PATH`. `BASE_URL` permite testar um servidor já iniciado. Os testes usam dados simulados identificados e não substituem a validação das fontes ao vivo.

## Publicar no Render

O arquivo `render.yaml` define um Web Service com Node.js. Após o código estar no GitHub:

1. Entre em https://dashboard.render.com/ com seu GitHub.
2. Selecione **New → Blueprint**, conecte `lucas2001sillva/Buscador-de-vagas-` e use a branch `main`.
3. Confira o plano **Free**, caso disponível na conta, e confirme a criação.
4. Aguarde o deploy e abra o endereço fornecido pelo painel. Confira se as fontes carregam.

Configuração manual: build `npm ci --include=dev && npm run build`, start `npm start`, variável `NODE_VERSION=24.19.0` e health check `/api/health`. O servidor escuta em `0.0.0.0` e usa `PORT` fornecida pela hospedagem. Uma hospedagem somente de arquivos estáticos não atende a API de vagas. O plano gratuito pode suspender o serviço por inatividade.

Os favoritos pertencem ao navegador e não são sincronizados. O site não coleta currículos nem envia candidaturas. O deploy só está confirmado após verificação no serviço de hospedagem.
