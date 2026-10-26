import { safeJobUrl } from './job-schema.js';
export const PORTALS = [
  { id: 'glassdoor', name: 'Glassdoor', url: 'https://www.glassdoor.com.br/Vaga/engenheiro-de-software-vagas-SRCH_KO0,22.htm' },
  { id: 'indeed', name: 'Indeed', url: 'https://br.indeed.com/jobs?l=Brasil' },
  { id: 'infojobs', name: 'InfoJobs', url: 'https://www.infojobs.com.br/empregos.aspx' },
  { id: 'catho', name: 'Catho', url: 'https://www.catho.com.br/vagas/' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/jobs/' },
  { id: 'randstad', name: 'Randstad', url: 'https://www.randstad.com.br/empregos/' },
];
export function identifyPortal(value) {
  const url = safeJobUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname;
  const domains = { glassdoor: ['glassdoor.com.br', 'glassdoor.com'], indeed: ['indeed.com'], infojobs: ['infojobs.com.br'], catho: ['catho.com.br'], linkedin: ['linkedin.com'], randstad: ['randstad.com.br'] };
  return PORTALS.find(portal => domains[portal.id].some(domain => host === domain || host.endsWith(`.${domain}`))) ?? null;
}
