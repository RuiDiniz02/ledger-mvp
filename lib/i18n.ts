import type { Lang } from './types';

const en = {
  overview: 'Overview', activity: 'Activity', budget: 'Budget', account: 'Account',
  categories: 'Categories', recent: 'Recent', allActivity: 'All activity',
  remaining: 'Remaining', spent: 'Spent', budgetLabel: 'Budget', safeDaily: 'Safe to spend daily',
  day: 'Day', of: 'of', left: 'Left', active: 'active',
  newExpense: 'New expense', note: 'Note (optional)', today: 'Today', yesterday: 'Yesterday',
  justMe: 'Just me', split5050: 'Split 50/50', customPct: 'Custom %', you: 'You', partner: 'Partner',
  countsAgainst: 'counts against your budget', save: 'Save', enterAmount: 'Enter an amount',
  addCategory: 'Add category', categoryTargets: 'Category targets', monthlyCeiling: 'Monthly ceiling',
  allocated: 'allocated', unallocated: 'unallocated', overCeiling: 'over ceiling', fullyAllocated: 'fully allocated',
  transactions: 'transactions', adjustTarget: 'Adjust this target', deleteTx: 'Delete', close: 'Close',
  editCategory: 'Edit category', newCategory: 'New category', name: 'Name', target: 'Target',
  fixed: 'Fixed', variable: 'Variable', create: 'Create category', saveChanges: 'Save changes',
  deleteCategory: 'Delete category', deleteCatWarn: 'Its expenses stay in your history, uncategorised.',
  language: 'Language', settings: 'Settings', workspace: 'Workspace name', resetData: 'Erase all data',
  resetBody: 'Removes everything stored in this browser.', erase: 'Erase',
  emptyTitle: 'Nothing logged yet', emptyBody: 'Tap the + button to record your first expense.',
  noCats: 'No categories yet', noCatsBody: 'Add a few in Budget, then start logging.',
  noBudget: 'No ceiling set for this month', noBudgetBody: 'Set one below to see progress and warnings.',
  noTx: 'No expenses this month',
  overBy: 'over budget', used: 'used', tight: 'tight', funded: 'Funded for the month', noTarget: 'No target set',
  runningHot: 'is running hot', isOver: 'is', moveHeadroom: 'Move headroom from a funded category',
  rebalance: 'Rebalance', daysLeft: 'days left', withDaysLeft: 'with {n} days left',
  unsettledTitle: 'Unsettled from splits', unsettledBody: 'owed to you once a partner joins',
  comingNext: 'Coming next', sharedHousehold: 'Shared household', sharedBody: 'Invite a second person into one ledger',
  bankSync: 'Bank sync', bankBody: 'Auto-import and categorise transactions',
  logged: 'Logged', deleted: 'Transaction deleted', added: 'added', updated: 'updated', saved: 'Saved',
  setupWelcome: 'Set up your month', setupLang: 'Language', setupName: 'What should we call this space?',
  setupNamePh: 'e.g. Rui, Household, Personal', setupCeiling: 'Monthly spending ceiling',
  setupCeilingHelp: 'The most you want to spend in a month. You can change it any month.',
  setupCats: 'Pick your categories', setupCatsHelp: 'Tap to add. Rename, recolour or delete any of them later.',
  setupTargets: 'Set a target for each', setupTargetsHelp: 'Leave one at zero if you would rather decide later.',
  next: 'Next', back: 'Back', finish: 'Start using it', skip: 'Skip',
  copyPrev: 'Copied from last month', thisMonth: 'This month', perMonth: 'Budgets are per month',
  feedback: 'Taps & sounds', feedbackBody: 'A light click and vibration on every tap.', on: 'On', off: 'Off',
  confirmExpense: 'Confirm',
};

const pt: typeof en = {
  overview: 'Resumo', activity: 'Movimentos', budget: 'Orçamento', account: 'Conta',
  categories: 'Categorias', recent: 'Recentes', allActivity: 'Ver tudo',
  remaining: 'Disponível', spent: 'Gasto', budgetLabel: 'Orçamento', safeDaily: 'Podes gastar por dia',
  day: 'Dia', of: 'de', left: 'Falta', active: 'ativas',
  newExpense: 'Nova despesa', note: 'Nota (opcional)', today: 'Hoje', yesterday: 'Ontem',
  justMe: 'Só eu', split5050: 'Dividir 50/50', customPct: '% à medida', you: 'Tu', partner: 'Parceiro',
  countsAgainst: 'contam para o teu orçamento', save: 'Guardar', enterAmount: 'Introduz um valor',
  addCategory: 'Adicionar categoria', categoryTargets: 'Limites por categoria', monthlyCeiling: 'Limite mensal',
  allocated: 'atribuído', unallocated: 'por atribuir', overCeiling: 'acima do limite', fullyAllocated: 'totalmente atribuído',
  transactions: 'movimentos', adjustTarget: 'Ajustar este limite', deleteTx: 'Apagar', close: 'Fechar',
  editCategory: 'Editar categoria', newCategory: 'Nova categoria', name: 'Nome', target: 'Limite',
  fixed: 'Fixa', variable: 'Variável', create: 'Criar categoria', saveChanges: 'Guardar alterações',
  deleteCategory: 'Apagar categoria', deleteCatWarn: 'As despesas ficam no histórico, sem categoria.',
  language: 'Idioma', settings: 'Definições', workspace: 'Nome do espaço', resetData: 'Apagar tudo',
  resetBody: 'Remove tudo o que está guardado neste browser.', erase: 'Apagar',
  emptyTitle: 'Ainda não há registos', emptyBody: 'Carrega no + para registar a primeira despesa.',
  noCats: 'Ainda não há categorias', noCatsBody: 'Cria algumas no Orçamento e começa a registar.',
  noBudget: 'Sem limite definido para este mês', noBudgetBody: 'Define um abaixo para veres progresso e avisos.',
  noTx: 'Sem despesas este mês',
  overBy: 'acima do limite', used: 'usado', tight: 'no limite', funded: 'Financiado este mês', noTarget: 'Sem limite definido',
  runningHot: 'está a aquecer', isOver: 'está', moveHeadroom: 'Tira folga de uma categoria já financiada',
  rebalance: 'Reequilibrar', daysLeft: 'dias restantes', withDaysLeft: 'faltam {n} dias',
  unsettledTitle: 'Por acertar em despesas divididas', unsettledBody: 'a receber quando alguém se juntar',
  comingNext: 'A caminho', sharedHousehold: 'Carteira partilhada', sharedBody: 'Convidar outra pessoa para a mesma carteira',
  bankSync: 'Sincronização bancária', bankBody: 'Importar e categorizar movimentos automaticamente',
  logged: 'Registado', deleted: 'Movimento apagado', added: 'adicionada', updated: 'atualizada', saved: 'Guardado',
  setupWelcome: 'Configura o teu mês', setupLang: 'Idioma', setupName: 'Como queres chamar a este espaço?',
  setupNamePh: 'ex. Rui, Casa, Pessoal', setupCeiling: 'Limite de gastos mensal',
  setupCeilingHelp: 'O máximo que queres gastar num mês. Podes mudar em qualquer mês.',
  setupCats: 'Escolhe as categorias', setupCatsHelp: 'Toca para adicionar. Podes renomear, mudar a cor ou apagar depois.',
  setupTargets: 'Define um limite para cada', setupTargetsHelp: 'Deixa a zero se preferires decidir mais tarde.',
  next: 'Continuar', back: 'Voltar', finish: 'Começar', skip: 'Saltar',
  copyPrev: 'Copiado do mês anterior', thisMonth: 'Este mês', perMonth: 'Os orçamentos são mensais',
  feedback: 'Toques e som', feedbackBody: 'Um clique leve e vibração em cada toque.', on: 'Ligado', off: 'Desligado',
  confirmExpense: 'Confirmar',
};

export type Key = keyof typeof en;
const dicts = { en, pt };

export function makeT(lang: Lang) {
  const d = dicts[lang] || en;
  return (k: Key, vars?: Record<string, string | number>) => {
    let s: string = d[k] || en[k] || String(k);
    if (vars) for (const [key, v] of Object.entries(vars)) s = s.split('{' + key + '}').join(String(v));
    return s;
  };
}
export type T = ReturnType<typeof makeT>;
