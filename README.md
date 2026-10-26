# Próxima Vaga

Buscador em português com foco em vagas disponíveis no Brasil. Reúne anúncios públicos de **Gupy**, **ProgramaThor** e das comunidades **Front-end BR**, **Back-end BR** e **React Brasil** no GitHub. Inclui passagens bíblicas da NVI conferidas nos PDFs fornecidos pelo usuário.

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

A API retorna HTTP 502 apenas quando não há nenhuma fonte válida, nem cache utilizável. Uma fonte que responde com lista vazia válida continua sendo uma consulta bem-sucedida. URLs repetidas são eliminadas, desconsiderando parâmetros usuais de rastreamento. Não há vagas fictícias para substituir fontes fora do ar.

Não são necessárias chaves de API. Em redes restritas, permita **portal.gupy.io**, **programathor.com.br** e **github.com**. A instalação usa **registry.npmjs.org**. O suporte nativo a `HTTP_PROXY`, `HTTPS_PROXY` e `NO_PROXY` do Node.js permanece ativo, com validação TLS. Fontes tipográficas e ícones são locais. A antiga rota `portal.api.gupy.io/api/v1/jobs` não é usada.

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
