// Seed inicial. Contém só o que a especificação define (Linux + 7 revisões).
// As 40 sessões reais: importar o CSV pela tela Configurações > Importar agenda (CSV).
export const STUDY_SEED = {
  exams: [
    { name: 'Transpetro', role_name: 'Análise de Sistemas — Processos de Negócios', board: 'Cesgranrio', exam_date: '2026-12-06' },
    { name: 'CREMERJ', role_name: 'Analista de Suporte', board: 'Instituto Consulplan', exam_date: '2026-12-13' },
  ],
  tasks: [
    { id: 'linux-base', date: '2026-10-19', exam: 'CREMERJ', subject: 'Linux', title: 'Linux — usuários, permissões, diretórios, comandos', content: 'Linux + prática + teste inicial', minutes: 120 },
  ],
  reviews: [
    { id: 'linux-r1', of: 'linux-base', stage: 'd1', date: '2026-10-20', minutes: 15, title: 'Revisão Linux D+1' },
    { id: 'linux-r2', of: 'linux-base', stage: 'd3', date: '2026-10-22', minutes: 20, title: 'Revisão Linux D+3' },
    { id: 'linux-r3', of: 'linux-base', stage: 'd7', date: '2026-10-26', minutes: 20, title: 'Revisão Linux D+7' },
    { id: 'linux-r4', of: 'linux-base', stage: 'd15', date: '2026-11-03', minutes: 20, title: 'Revisão Linux D+15' },
    { id: 'linux-r5', of: 'linux-base', stage: 'd30', date: '2026-11-18', minutes: 25, title: 'Revisão Linux D+30' },
    { id: 'linux-r6', of: 'linux-base', stage: 'd45', date: '2026-12-03', minutes: 30, title: 'Revisão Linux D+45' },
    { id: 'linux-r7', of: 'linux-base', stage: 'pre', date: '2026-12-11', minutes: 30, title: 'Revisão Linux pré-prova' },
  ],
};
