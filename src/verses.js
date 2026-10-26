// Texto conferido nos PDFs NVI enviados pelo usuário; páginas físicas dos arquivos.
// A grafia e a pontuação foram preservadas. PDFs completos não são distribuídos.
export const VERSES = [
  { reference: 'Filipenses 4:13', text: 'Tudo posso naquele que me fortalece.', file: 'NT-NVI-Pt.pdf', page: 203 },
  { reference: 'Josué 1:9', text: 'Não fui eu que lhe ordenei? Seja forte e corajoso! Não se apavore, nem desanime, pois o SENHOR, o seu Deus, estará com você por onde você andar.', file: 'AT-NVI-Pt.pdf', page: 181 },
  { reference: 'Salmos 37:5', text: 'Entregue o seu caminho ao SENHOR; confie nele, e ele agirá:', file: 'AT-NVI-Pt.pdf', page: 533 },
  { reference: 'Provérbios 3:5–6', text: 'Confie no SENHOR de todo o seu coração e não se apóie em seu próprio entendimento; reconheça o SENHOR em todos os seus caminhos, e ele endireitará as suas veredas.', file: 'AT-NVI-Pt.pdf', page: 650 },
  { reference: 'Filipenses 4:6–7', text: 'Não andem ansiosos por coisa alguma, mas em tudo, pela oração e súplicas, e com ação de graças, apresentem seus pedidos a Deus. E a paz de Deus, que excede todo o entendimento, guardará o coração e a mente de vocês em Cristo Jesus.', file: 'NT-NVI-Pt.pdf', page: 202 },
  { reference: 'Mateus 6:34', text: 'Portanto, não se preocupem com o amanhã, pois o amanhã trará as suas próprias preocupações. Basta a cada dia o seu próprio mal.', file: 'NT-NVI-Pt.pdf', page: 8 },
];
export function dailyVerseIndex(date = new Date()) {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000) % VERSES.length;
}
