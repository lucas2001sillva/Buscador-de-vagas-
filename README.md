# Próxima Vaga

Buscador em português com foco em vagas disponíveis no Brasil. Reúne anúncios públicos de **Glassdoor**, **Indeed**, **Randstad**, **Gupy**, **ProgramaThor** e comunidades brasileiras no GitHub. **InfoJobs**, **Catho** e **LinkedIn** têm estados de conexão explícitos, conforme a disponibilidade e a configuração descritas abaixo. Inclui passagens bíblicas da NVI conferidas nos PDFs fornecidos pelo usuário.

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

- Busca por cargo, empresa e tags, combinada com cidade ou estado, sem diferenciar acentos e maiúsculas.
- Filtro com seleção múltipla de **presencial, híbrido e remoto**, além de **não informado**. Selecionar dois modelos inclui vagas de qualquer um deles.
- Contratos padronizados em português: CLT, PJ, Estágio, Aprendiz, Temporário, Autônomo, Cooperado, Voluntário e Bolsista. Tipos desconhecidos ficam em **Não informado**; jornada integral ou parcial não é interpretada como contrato.
- Filtro por fonte, ordenação, paginação local e favoritos persistidos no navegador.
- Fonte original em cada anúncio, detalhes e link para consultar a vaga e se candidatar na origem.
- Passagem NVI selecionada por dia no fuso de São Paulo, com botão **Outra passagem**, referência bíblica e página do PDF enviado.
- Interface responsiva, navegação por teclado, estados de carregamento, erro e resultados vazios.

## Fontes e limites

| Fonte | Consulta pública | Seleção |
| --- | --- | --- |
| Glassdoor | `glassdoor.com.br/Vaga/engenheiro-de-software-vagas-SRCH_KO0,22.htm` | Primeira página da consulta pública de engenharia de software, com empresas, locais e resumos efetivamente publicados. Não representa todo o catálogo do Glassdoor. |
| Indeed | `br.indeed.com/jobs?l=Brasil` | Primeira página pública da seleção Brasil; lê somente os anúncios serializados, descarta expirados e publicações com mais de 180 dias. Não executa scripts da fonte nem utiliza tokens da sessão pública. |
| Randstad | `randstad.com.br/empregos/` | Primeira página pública, com contrato e data informados pela fonte. A empresa exibida é Randstad; clientes não informados não são inventados. |
| InfoJobs | `infojobs.com.br/empregos.aspx` | Leitor de anúncios estruturados JobPosting preparado. A fonte respondeu HTTP 500 nesta validação; não é apresentada como conectada. |
| Catho | Integração opcional via índice Google Jobs | A consulta direta respondeu HTTP 403; conexão pendente de configuração e validação do provedor. |
| LinkedIn | Integração opcional via índice Google Jobs | Não há consulta automatizada direta sem permissão. Conexão pendente de configuração e validação do provedor. |
| Gupy | `portal.gupy.io/api/job-search/jobs` | Até 100 anúncios da busca mais recente; somente país Brasil ou localização em uma UF brasileira reconhecida. Na indisponibilidade da rota, usa os dados públicos da página de busca. Exclui banco de talentos e prazo de inscrição vencido quando informado. |
| ProgramaThor | `programathor.com.br/jobs` | Anúncios da primeira página pública do portal brasileiro de tecnologia; publicidade é ignorada. Datas ausentes não são inventadas. |
| Front-end BR | `github.com/frontendbr/vagas/issues` | Primeira página pública de anúncios abertos, publicados nos últimos 180 dias. |
| Back-end BR | `github.com/backend-br/vagas/issues` | Mesmo critério, na comunidade de back-end. |
| React Brasil | `github.com/react-brasil/vagas/issues` | Mesmo critério, na comunidade de React. |

A busca é feita **na seleção carregada**, não em todos os anúncios de todos os portais. Comunidades brasileiras podem divulgar oportunidades internacionais para candidatos do Brasil: localizações explicitamente estrangeiras no título são excluídas, mas a elegibilidade de vagas remotas deve ser confirmada no anúncio. Não é possível garantir que um anúncio ainda aberto continue contratando.

Modalidades só são atribuídas com indicação explícita da fonte. Uma cidade informada ou a ausência de indicação de remoto não determina se a vaga é presencial ou híbrida. No GitHub, a modalidade explícita no título tem prioridade sobre rótulos genéricos. Na Gupy, `Efetivo` é apresentado como CLT; outros tipos conhecidos são normalizados, sem transformar cargo, senioridade ou jornada em contrato.

Anúncios podem manter termos originais em seus títulos e descrições. Os filtros e as modalidades são apresentados em português. Os favoritos da versão anterior da Arbeitnow são preservados como **favoritos antigos**, sem participar da nova seleção brasileira.

## Cache e disponibilidade

Cada fonte tem cache independente em memória por 10 minutos. Consultas simultâneas compartilham o mesmo carregamento; fontes são consultadas em paralelo. Cada requisição tem prazo de 15 segundos. Uma falha isolada mantém as demais fontes disponíveis e é identificada na interface. Dados antigos em cache são sinalizados; falhas respeitam intervalo de 1 minuto antes de uma nova tentativa.

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

**Ainda não houve validação autenticada:** o usuário informou não possuir uma API, e não há chave disponível. Os testes do provedor usam fixtures explícitas. Nenhuma requisição com credencial inventada é executada. As fontes protegidas aparecem como **Conexão pendente**, e não como fontes funcionando. InfoJobs aparece como indisponível enquanto a consulta pública falhar.

Para usar o provedor:

1. Obtenha uma chave em uma conta SerpApi e confira os limites e condições do plano escolhido.
2. Cadastre **SERPAPI_KEY** nas configurações seguras do ambiente para validar durante o desenvolvimento. No site, configure a variável separadamente em **Render → Environment** e reinicie/reimplante o serviço. Salvar o segredo no ambiente Codex não o envia ao Render.
3. Nunca coloque a chave em chat, Git, frontend ou arquivos de instruções. O código não registra URLs autenticadas nem corpos de erro do provedor.
4. Depois de configurar, valide `/api/jobs`: fontes `ok` indicam consulta concluída; contagem zero pode significar ausência de anúncios daquele portal na seleção indexada.

O provedor consulta uma página de Google Jobs para “vagas no Brasil”, com até 10 resultados por página, e usa cache compartilhado por uma hora. Essa seleção pode não conter todos os portais, não é todo o catálogo dos sites e depende da cobertura do índice. Os conectores públicos têm prioridade; o provedor é usado para as fontes protegidas e como alternativa quando uma consulta pública falha. O filtro da interface continua operando sobre a seleção carregada.

## AdSense

O snippet fornecido pelo usuário, do editor `ca-pub-7100655819276771`, está no `<head>` de `index.html` e é preservado na compilação de produção. Depois do deploy, o usuário pode marcar **Adicionei o código** e selecionar **Verificar** no painel do AdSense. A confirmação da propriedade e a aprovação do site pertencem ao Google e não são comprovadas apenas pela presença do script. Não foram criados blocos manuais de anúncio nem outro método de verificação.

## Passagens bíblicas

As seis passagens em `src/verses.js` foram conferidas em `NT-NVI-Pt.pdf` e `AT-NVI-Pt.pdf`, enviados pelo usuário. Cada registro inclui a referência, o nome do documento e a página física do arquivo. A grafia da edição foi preservada; marcas de nota de rodapé, números dos versículos e quebras de linha do PDF não integram o texto mostrado. Os PDFs completos não são publicados nem enviados ao GitHub.

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
