import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, BookOpen, BriefcaseBusiness, Check, ChevronDown, CircleAlert, Clock3, ExternalLink, Globe2, MapPin, Search, SlidersHorizontal, Sparkles, Wifi, X } from 'lucide-react';
import { filterJobs, relativeDate } from './jobs.js';
import { WORK_MODELS, CONTRACT_TYPES, restoreFavorite } from '../shared/job-schema.js';
import { VERSES, dailyVerseIndex } from './verses.js';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';

const STORAGE_KEY = 'proxima-vaga:favorites:v1';
function readFavorites() {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(items) ? items.map(restoreFavorite).filter(Boolean) : [];
  } catch { return []; }
}

function CompanyMark({ company }) {
  const color = [...company].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  return <div className={`company-mark mark-${color}`} aria-hidden="true">{company.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</div>;
}

function SaveButton({ job, saved, onToggle, small = false }) {
  return <button className={`save-button ${saved ? 'is-saved' : ''} ${small ? 'small' : ''}`} onClick={() => onToggle(job)} aria-label={`${saved ? 'Remover dos favoritos' : 'Salvar vaga'}: ${job.title}`} aria-pressed={saved} title={saved ? 'Remover dos favoritos' : 'Salvar vaga'}><Bookmark size={19} fill={saved ? 'currentColor' : 'none'} /></button>;
}

function JobCard({ job, saved, onToggle, onOpen }) {
  return <article className="job-card">
    <div className="job-top"><div className="company"><CompanyMark company={job.company} /><div><span className="company-name">{job.company}</span><span className="source-label">via {job.sourceName}{job.sourceStale ? ' · cache anterior' : ''} <ArrowUpRight size={11} /></span></div></div><SaveButton job={job} saved={saved} onToggle={onToggle} /></div>
    <button className="job-title" onClick={() => onOpen(job)}>{job.title}</button>
    <div className="job-meta"><span><MapPin size={14} />{job.location}</span><span><BriefcaseBusiness size={14} />{WORK_MODELS[job.workModel] || WORK_MODELS.unknown}</span></div>
    <div className="tags">{job.workModel && job.workModel !== 'unknown' && <span className={`tag model-${job.workModel}`}>{job.workModel === 'remote' && <Wifi size={12} />} {WORK_MODELS[job.workModel]}</span>}{[...job.types, ...job.tags].filter((tag, i, all) => all.indexOf(tag) === i).slice(0, 3).map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>
    <div className="job-bottom"><span><Clock3 size={13} />{relativeDate(job.publishedAt)}</span><button onClick={() => onOpen(job)}>Ver oportunidade <ArrowUpRight size={16} /></button></div>
  </article>;
}

function JobDetails({ job, saved, onToggle, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const closeOnBackdrop = event => { if (event.target === element) onClose(); };
    element.addEventListener('click', closeOnBackdrop);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.removeEventListener('click', closeOnBackdrop); document.body.style.overflow = previous; };
  }, [onClose]);
  return <dialog ref={dialog} className="job-dialog" onCancel={onClose} aria-labelledby="detail-title">
    <div className="dialog-content"><button className="close-dialog" aria-label="Fechar detalhes" onClick={onClose}><X size={22} /></button>
      <CompanyMark company={job.company} /><p className="detail-company">{job.company}</p><h2 id="detail-title">{job.title}</h2>
      <div className="job-meta"><span><MapPin size={15} />{job.location}</span><span><Clock3 size={15} />{relativeDate(job.publishedAt)}</span></div>
      <div className="tags">{job.workModel && job.workModel !== 'unknown' && <span className={`tag model-${job.workModel}`}>{WORK_MODELS[job.workModel]}</span>}{[...job.types, ...job.tags].map((tag, index) => <span className="tag" key={`${tag}-${index}`}>{tag}</span>)}</div>
      <div className="description"><h3>Sobre a oportunidade</h3><p>{job.description || 'A descrição completa está disponível na página original da vaga.'}</p></div>
      <p className="detail-note"><Globe2 size={16} /> Anúncio de {job.sourceName}. Confira a disponibilidade, a localização e as instruções de candidatura na fonte original. Vagas remotas podem ter restrições de cidade ou estado.</p>
      <div className="dialog-actions"><a className="primary-button" href={job.url} target="_blank" rel="noopener noreferrer">Ver vaga e candidatar <ExternalLink size={16} /></a><SaveButton job={job} saved={saved} onToggle={onToggle} /></div>
    </div>
  </dialog>;
}

function App() {
  const [jobs, setJobs] = useState([]);
  const [favorites, setFavorites] = useState(readFavorites);
  const [savedOnly, setSavedOnly] = useState(false);
  const [status, setStatus] = useState('loading');
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [location, setLocation] = useState('');
  const [workModels, setWorkModels] = useState([]);
  const [source, setSource] = useState('');
  const [sources, setSources] = useState([]);
  const [partial, setPartial] = useState(false);
  const [verseIndex, setVerseIndex] = useState(dailyVerseIndex);
  const verse = VERSES[verseIndex];
  const [type, setType] = useState('');
  const [sort, setSort] = useState('recent');
  const [pageSize, setPageSize] = useState(9);
  const [selected, setSelected] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const resultsRef = useRef(null);
  const savedIds = useMemo(() => favorites.map(job => job.id), [favorites]);
  const merged = useMemo(() => [...new Map([...favorites, ...jobs].map(job => [job.id, job])).values()], [favorites, jobs]);
  const sourceJobs = savedOnly ? merged : jobs;
  const results = useMemo(() => filterJobs(sourceJobs, { query, location, workModels, type, source, sort, savedOnly, savedIds }), [sourceJobs, query, location, workModels, type, source, sort, savedOnly, savedIds]);
  const sourceOptions = useMemo(() => [...new Map([...sources, ...sourceJobs.map(job => ({ id: job.sourceId, name: job.sourceName }))].map(item => [item.id, item])).values()], [sources, sourceJobs]);
  const companies = new Set(jobs.filter(job => job.company !== 'Empresa não informada').map(job => job.company)).size;
  const remoteCount = jobs.filter(job => job.workModel === 'remote').length;
  const controllerRef = useRef(null);

  async function loadJobs() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('loading');
    try {
      const response = await fetch('/api/jobs', { signal: controller.signal });
      if (!response.ok) throw new Error('Fonte indisponível');
      const data = await response.json();
      if (!Array.isArray(data.jobs)) throw new Error('Resposta inválida');
      setJobs(data.jobs); setSources(Array.isArray(data.sources) ? data.sources : []); setPartial(Boolean(data.partial)); setStale(data.stale); setUpdatedAt(data.updatedAt); setStatus('success');
    } catch (error) { if (error.name !== 'AbortError') setStatus('error'); }
  }
  useEffect(() => { loadJobs(); return () => controllerRef.current?.abort(); }, []);
  useEffect(() => { setPageSize(9); }, [query, location, workModels, type, source, savedOnly, sort]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function toggleFavorite(job) {
    setFavorites(previous => {
      const next = previous.some(item => item.id === job.id) ? previous.filter(item => item.id !== job.id) : [...previous, job];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
      catch { setNotice('Seu navegador não permitiu salvar os favoritos. Eles ficarão disponíveis apenas nesta sessão.'); }
      return next;
    });
  }
  function search(event) { event.preventDefault(); setQuery(queryInput.trim()); setLocation(locationInput.trim()); resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function clearFilters() { setQuery(''); setQueryInput(''); setLocation(''); setLocationInput(''); setWorkModels([]); setType(''); setSource(''); }
  const hasFilters = Boolean(query || location || workModels.length || type || source);
  const closeDetails = React.useCallback(() => setSelected(null), []);

  return <>
    <a className="skip-link" href="#oportunidades">Pular para as vagas</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="#" onClick={() => setSavedOnly(false)}><span className="brand-symbol"><ArrowUpRight size={23} strokeWidth={2.5} /></span>próxima<span className="brand-light">vaga</span><span className="brand-dot">.</span></a><nav aria-label="Navegação principal"><button className={!savedOnly ? 'nav-active' : ''} onClick={() => { setSavedOnly(false); clearFilters(); }}>Explorar vagas</button><button className={savedOnly ? 'nav-active' : ''} onClick={() => { setSavedOnly(true); clearFilters(); resultsRef.current?.scrollIntoView({ behavior: 'smooth' }); }}><Bookmark size={16} /> Favoritas <span className="count-pill">{favorites.length}</span></button></nav><span className="header-note"><span className="live-dot" /> Seu próximo capítulo começa aqui</span></div></header>
    <main>
      <section className="hero"><div className="hero-inner"><div className="hero-copy"><span className="eyebrow"><span /> NOVAS POSSIBILIDADES, TODO DIA</span><h1>Seu talento merece<br />um <span>novo lugar.<svg viewBox="0 0 330 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 10 Q165 -4 327 8" /></svg></span></h1><p>Encontre oportunidades que combinam com o seu próximo passo.<br className="desktop-break" /> Vagas no Brasil, reunidas de diferentes fontes. Um novo caminho para você.</p></div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="art-spark">✳</span><div className="floating-label"><span><Check size={14} /></span> O próximo passo é seu.</div><div className="art-card"><div className="art-card-top"><span className="art-icon"><BriefcaseBusiness size={27} /></span><span className="art-dots">•••</span></div><div className="art-line long" /><div className="art-line short" /><div className="art-card-bottom"><span /><span /><div className="art-arrow"><ArrowUpRight size={24} /></div></div></div><span className="art-tiny-spark">✦</span></div>
        <form className="search-box" onSubmit={search}><label className="search-field"><Search size={21} /><span className="sr-only">Cargo, empresa ou palavra-chave</span><input value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder="Cargo, empresa ou palavra-chave" /></label><label className="search-field location-field"><MapPin size={21} /><span className="sr-only">Cidade ou estado</span><input value={locationInput} onChange={event => setLocationInput(event.target.value)} placeholder="Cidade ou estado" /></label><button className="primary-button" type="submit">Encontrar vagas <ArrowRight size={18} /></button></form>
        <div className="popular"><span>Buscas populares:</span>{['Desenvolvedor', 'Administrativo', 'Marketing', 'Vendas'].map(term => <button key={term} onClick={() => { setQueryInput(term); setQuery(term); resultsRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>{term} <ArrowUpRight size={12} /></button>)}</div>
      </div></section>
      <div className="page-content"><section className="stats-strip" aria-label="Resumo das vagas carregadas"><div><span className="stat-icon"><BriefcaseBusiness size={18} /></span><strong>{status === 'success' ? jobs.length : '—'}</strong><span>vagas nesta seleção</span></div><div><span className="stat-icon"><Globe2 size={18} /></span><strong>{status === 'success' ? companies : '—'}</strong><span>empresas para conhecer</span></div><div><span className="stat-icon"><Wifi size={18} /></span><strong>{status === 'success' ? remoteCount : '—'}</strong><span>oportunidades remotas</span></div><span className="stats-source"><span className={`live-dot ${status === 'error' ? 'offline' : ''}`} /> {sources.filter(item => item.status === 'ok').length} fontes consultadas</span></section>
        <section className="verse-card" aria-labelledby="verse-heading"><span className="verse-icon"><BookOpen size={24} /></span><div className="verse-content"><h2 id="verse-heading">Uma palavra de esperança</h2><blockquote aria-live="polite"><p>“{verse.text}”</p><cite>{verse.reference} · NVI</cite></blockquote><details><summary>Fonte da passagem</summary><p>Texto conferido em {verse.file}, página {verse.page} do PDF enviado.</p></details></div><button className="verse-next" onClick={() => setVerseIndex(index => (index + 1) % VERSES.length)}>Outra passagem <ArrowRight size={15} /></button></section>
        <div className="main-layout" id="oportunidades" ref={resultsRef}>
          <aside className={`sidebar ${filtersOpen ? 'filters-open' : ''}`}><div className="filter-heading"><h2><SlidersHorizontal size={17} /> Refine sua busca</h2><button onClick={clearFilters} disabled={!hasFilters}>Limpar</button></div><div className="filter-section"><h3>Modelo de trabalho</h3><div className="model-options">{Object.entries(WORK_MODELS).map(([value, label]) => <label className="checkbox-label" key={value}><input type="checkbox" checked={workModels.includes(value)} onChange={() => setWorkModels(previous => previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value])} /><span>{label}</span><span className="model-count">{sourceJobs.filter(job => (job.workModel || 'unknown') === value).length}</span></label>)}</div><p className="filter-hint">Selecione um ou mais modelos. Quando a fonte não informa, não presumimos a modalidade.</p></div><div className="filter-section"><label className="filter-label" htmlFor="contract">Tipo de contrato</label><div className="select-wrap"><select id="contract" value={type} onChange={event => setType(event.target.value)}><option value="">Todos os tipos</option>{CONTRACT_TYPES.map(item => <option key={item}>{item}</option>)}<option value="unknown">Não informado</option></select><ChevronDown size={14} /></div></div><div className="filter-section"><label className="filter-label" htmlFor="source">Fonte das vagas</label><div className="select-wrap"><select id="source" value={source} onChange={event => setSource(event.target.value)}><option value="">Todas as fontes</option>{sourceOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></div></div><div className="source-card" id="fontes"><span className="source-card-icon"><Globe2 size={22} /></span><h3>Seu próximo passo, no Brasil.</h3><p>Portais de emprego e comunidades brasileiras em uma só seleção. Confira a contratação e a localização no anúncio original.</p><ul className="source-list">{sources.map(item => <li key={item.id}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}<ArrowUpRight size={12} /></a><span className={`source-status ${item.status}`}>{item.status === 'ok' ? `${item.count} vagas` : item.status === 'stale' ? 'Cache anterior' : 'Indisponível'}</span></li>)}</ul></div><p className="sidebar-note"><Bookmark size={15} /> Salve as vagas que chamaram sua atenção. Seus favoritos ficam neste navegador.</p></aside>
          <section className="results" aria-label="Resultados da busca"><div className="results-heading"><div><span className="section-eyebrow">SEU PRÓXIMO PASSO</span><h2>{savedOnly ? 'Suas vagas favoritas' : 'Encontre sua oportunidade'}<span className="heading-dot">.</span></h2><p aria-live="polite">{status === 'loading' && !savedOnly ? 'Buscando novas possibilidades…' : `${results.length} ${results.length === 1 ? 'oportunidade encontrada' : 'oportunidades encontradas'}${hasFilters ? ' para sua busca' : ' para explorar'}`}</p></div><label className="sort-label"><span>Ordenar por</span><div className="select-wrap"><select aria-label="Ordenar vagas" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Mais recentes</option><option value="company">Empresa (A–Z)</option></select><ChevronDown size={14} /></div></label></div>
            <button className="mobile-filter" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><SlidersHorizontal size={16} />{filtersOpen ? 'Ocultar filtros' : 'Filtrar oportunidades'}</button>
            {hasFilters && <div className="active-filters">{query && <button onClick={() => { setQuery(''); setQueryInput(''); }}>{query}<X size={13} /></button>}{location && <button onClick={() => { setLocation(''); setLocationInput(''); }}><MapPin size={12} />{location}<X size={13} /></button>}{workModels.map(model => <button key={model} onClick={() => setWorkModels(previous => previous.filter(item => item !== model))}>{WORK_MODELS[model]}<X size={13} /></button>)}{source && <button onClick={() => setSource('')}>{sourceOptions.find(item => item.id === source)?.name}<X size={13} /></button>}{type && <button onClick={() => setType('')}>{type === 'unknown' ? 'Contrato não informado' : type}<X size={13} /></button>}</div>}
            {partial && <div className="inline-warning" role="status"><CircleAlert size={17} /><span>Algumas fontes não responderam: {sources.filter(item => item.status !== 'ok').map(item => item.name).join(', ')}. As demais continuam disponíveis.{stale && ' As vagas em cache estão identificadas nas fontes.'}</span></div>}
            {savedOnly && <p className="saved-note">Favoritos são guardados neste navegador. Uma vaga salva pode já ter sido encerrada na fonte.</p>}
            {status === 'loading' && !savedOnly ? <div className="jobs-grid" aria-busy="true" aria-label="Carregando vagas">{[1, 2, 3, 4, 5, 6].map(item => <div className="skeleton-card" key={item}><div className="skeleton square" /><div className="skeleton wide" /><div className="skeleton medium" /><div className="skeleton wide" /></div>)}</div> : status === 'error' && !savedOnly ? <div className="empty-state" role="alert"><span className="empty-icon"><Globe2 size={30} /></span><h3>As vagas estão a um passo daqui.</h3><p>Não foi possível consultar as fontes de vagas agora. Verifique a conexão e tente novamente.</p><button className="primary-button" onClick={loadJobs}>Tentar novamente <ArrowRight size={16} /></button></div> : results.length ? <><div className="jobs-grid">{results.slice(0, pageSize).map(job => <JobCard key={job.id} job={job} saved={savedIds.includes(job.id)} onToggle={toggleFavorite} onOpen={setSelected} />)}</div>{results.length > pageSize ? <button className="load-more" onClick={() => setPageSize(value => value + 9)}>Mostrar mais oportunidades <ArrowDown size={16} /><span>{results.length - pageSize} restantes</span></button> : <p className="results-end"><Check size={15} /> Você viu todas as oportunidades desta seleção.</p>}</> : <div className="empty-state"><span className="empty-icon">{savedOnly ? <Bookmark size={28} /> : <Search size={28} />}</span><h3>{savedOnly && !hasFilters ? 'Seu próximo passo pode começar com um favorito.' : 'Vamos tentar um novo caminho?'}</h3><p>{savedOnly && !hasFilters ? 'Clique no marcador de uma vaga para guardá-la aqui e consultar depois.' : 'Não encontramos vagas com esses filtros. Tente outro termo, cidade ou modelo de trabalho.'}</p><button className="primary-button" onClick={() => { clearFilters(); if (savedOnly) setSavedOnly(false); }}>{savedOnly ? 'Explorar vagas' : 'Limpar filtros'}<ArrowRight size={16} /></button></div>}
            {updatedAt && <p className="update-note">Seleção consultada em {new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Seleção limitada aos anúncios consultados; não abrange todas as vagas dos portais. Confirme a disponibilidade na origem.</p>}
          </section>
        </div>
        <section className="bottom-banner"><span className="banner-spark"><Sparkles size={27} /></span><div><h2>Um novo capítulo começa com uma possibilidade.</h2><p>Explore no seu ritmo. Salve o que faz sentido para você.</p></div><button onClick={() => { setSavedOnly(true); clearFilters(); resultsRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>Ver minhas favoritas <ArrowUpRight size={17} /></button></section>
      </div>
    </main>
    <footer><a className="footer-brand" href="#">próximavaga.</a><p>Feito para conectar pessoas a novos caminhos.</p><a href="#fontes" onClick={() => setFiltersOpen(true)}>Conheça as fontes <ArrowUpRight size={13} /></a></footer>
    {selected && <JobDetails job={selected} saved={savedIds.includes(selected.id)} onToggle={toggleFavorite} onClose={closeDetails} />}
    {notice && <div className="toast" role="status"><CircleAlert size={18} />{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
