# Próxima Vaga

Buscador em português com React e Node.js. Consulta vagas reais da API pública da [Arbeitnow](https://www.arbeitnow.com), sem chave de API. A seleção contém a primeira página do feed, com foco em oportunidades internacionais, especialmente na Europa; não é uma busca completa de todas as vagas da plataforma.

## Executar

Requer **Node.js 24.5 ou superior** e npm. A série 24 está indicada em `.nvmrc`.

```bash
npm ci
npm run dev
```

O servidor usa a porta 3000. Para alterar: `PORT=4000 npm run dev`. O mesmo processo serve o site e as rotas `/api/jobs` e `/api/health`.

```bash
npm test
npm run build
npm start
```

`npm start` serve a compilação de produção, gerada antes com `npm run build`.

## Recursos

- Busca por cargo, empresa e tags, combinada com cidade ou país, sem diferenciar acentos ou maiúsculas.
- Filtros de remoto e contrato, quando informados pela fonte; ordenação por data ou empresa.
- Favoritos guardados neste navegador, disponíveis mesmo quando a fonte está fora do ar; não são sincronizados entre dispositivos.
- Detalhes em modal acessível e candidatura no site original.
- Interface responsiva com carregamento, erro, filtros e resultados vazios.

## Fonte e rede

O servidor consulta `https://www.arbeitnow.com/api/job-board-api` com prazo de 15 segundos e cache em memória de 10 minutos. Consultas simultâneas compartilham uma requisição. Na falha, a última seleção disponível recebe um aviso de desatualização. Sem cache, a API retorna HTTP 502 e o site permite tentar novamente. Não há vagas fictícias como alternativa à fonte real.

Em redes restritas, permita **www.arbeitnow.com**. A instalação usa **registry.npmjs.org**. O servidor usa o suporte nativo a `HTTP_PROXY`, `HTTPS_PROXY` e `NO_PROXY` do Node.js 24, mantendo a validação TLS. Fontes e ícones são servidos localmente. Nenhuma credencial é necessária.

Títulos e descrições permanecem no idioma original. Confirme na fonte as restrições de país e autorização de trabalho: remoto não implica contratação em qualquer país. Não são inferidos salário, modalidade híbrida ou elegibilidade para visto. Favoritos podem conter vagas já encerradas.

## Organização e testes

- `src/`: aplicação React, filtros e estilos.
- `server/`: servidor HTTP, integração e cache.
- `test/`: normalização, segurança dos links, filtros, cache, falhas da fonte e rotas HTTP.

Os testes usam dados simulados explícitos; não substituem validar a fonte ao vivo. Os favoritos incluem os detalhes das vagas no armazenamento local. O sistema não coleta currículos nem envia candidaturas. A publicação do código e o deploy são etapas separadas e não são executados automaticamente.

Para testar os fluxos no navegador e verificar acessibilidade automaticamente, execute `npm run build && npm run test:ui`. O teste inicia e encerra seu próprio servidor. Ele usa Chromium em `/usr/bin/chromium`, quando disponível; em outro sistema, instale o navegador com `npx playwright install chromium` ou informe o executável com `CHROMIUM_PATH`. `BASE_URL` permite testar um servidor já iniciado. Os testes da interface simulam a API explicitamente, sem alterar a fonte usada pela aplicação.

## Publicar no Render

O arquivo `render.yaml` prepara um Web Service com Node.js, compilação do site e verificação de saúde. A publicação exige uma conta do Render conectada ao GitHub e os arquivos desta aplicação enviados ao repositório; arquivos presentes apenas no ambiente de desenvolvimento não ficam automaticamente disponíveis no GitHub.

1. Crie uma conta em https://dashboard.render.com/ com seu GitHub.
2. Depois que o código estiver no GitHub, no Render selecione **New → Blueprint** e conecte `lucas2001sillva/Buscador-de-vagas-`, branch `main`.
3. Confira o serviço definido em `render.yaml` e o plano **Free**, caso disponível na sua conta, antes de criar o serviço. Não são necessárias chaves de API.
4. Aguarde a compilação e a inicialização. O endereço público é o fornecido pelo painel do Render após o deploy; ele não é conhecido antecipadamente.
5. Abra o endereço e confirme que as vagas são carregadas. O plano gratuito pode suspender o serviço quando inativo; o primeiro acesso pode demorar mais.

Para configurar manualmente como **Web Service**, use build `npm ci --include=dev && npm run build`, start `npm start`, variável `NODE_VERSION=24.19.0` e health check `/api/health`. O servidor já escuta em `0.0.0.0` e usa a variável `PORT` fornecida pela hospedagem. Uma hospedagem de arquivos estáticos isolada não atende a rota de vagas deste projeto.
