// UI strings, in Brazilian Portuguese (pt-BR): the app's only language.
//
// Transaction descriptions and account names are not translated: they are
// data from the banks (via Pluggy) and shown as the bank sends them.

export interface Messages {
  nav: {
    overview: string
    transactions: string
    accounts: string
    installments: string
    categories: string
  }
  mainNav: string
  demoData: string
  demoNote: string
  loading: string
  loadErrorTitle: string
  loadErrorBody: string
  tryAgain: string
  previousMonth: string
  nextMonth: string
  income: string
  expenses: string
  transfers: string
  net: string
  seeAll: string
  pending: string
  close: string
  done: string
  category: string
  other: string
  /** Last line of a chart's month breakdown. */
  chartTotal: string
  cardOf: (institution: string) => string
  oneUnitIs: (currency: string, rate: string) => string
  overview: {
    subtitle: (date: string) => string
    netWorth: string
    /** Net worth now: what it is made of. */
    netWorthNote: string
    inAccounts: string
    cardBills: string
    debtShare: (pct: string) => string
    byBankNet: string
    /** Average income card. */
    avgIncome: {
      title: string
      sub: (months: number) => string
      perMonth: string
      range: (lowest: string, lowMonth: string, highest: string, highMonth: string) => string
      current: (amount: string, pct: string, above: boolean) => string
      /** Nothing in yet this month: no comparison. */
      currentNone: (amount: string) => string
      avgLabel: (amount: string) => string
      chart: (average: string) => string
      /** The category filter: the card's pill and its picker. */
      filter: {
        all: string
        partial: string
        count: (n: number, total: number) => string
        aria: (names: string, n: number, total: number) => string
        and: string
        title: string
        desc: string
        listLabel: string
        avgCol: string
        uncategorizedNote: string
        resultLabel: string
        allLabel: string
        markAll: string
        apply: string
        saving: string
        noneHint: string
        expand: (name: string) => string
        collapse: (name: string) => string
      }
    }
    whereMoney: string
    balancesNote: string
    byCurrency: string
    byBank: string
    incomeVsExpenses: string
    lastMonths: (months: number) => string
    /** The period of the multi-month charts. */
    range: { label: string; months: (n: number) => string; year: string }
    kept: string
    keptShort: string
    comingUp: string
    openCardBills: string
    due: (date: string) => string
    installmentsNextMonth: string
    nextMonthPurchases: (month: string, n: number) => string
    spendingByCategory: string
    monthInDetail: string
    categories: string
    noExpenses: string
    latestTransactions: string
  }
  transactions: {
    search: string
    /** Chip on Transactions when opened from a card's bill. */
    billChip: (closed: boolean, from: string, to: string) => string
    billShowAll: string
    billTotal: (amount: string) => string
    billExpected: (amount: string) => string
    allMonths: string
    /** Older months are fetched from the database when chosen. */
    fetchingStored: string
    fetchStoredFailed: string
    type: string
    allTypes: string
    account: string
    allAccounts: string
    allCategories: string
    clear: string
    clearFilters: string
    colDescription: string
    colAmount: string
    count: (n: number, month: string | null) => string
    emptyTitle: string
    emptyBody: (month: string | null) => string
    details: string
    kindIncome: string
    kindExpense: string
    kindTransfer: string
    installmentN: (n: number, total: number) => string
    date: string
    inBRL: string
    installment: string
    installmentEnds: (n: number, total: number, month: string) => string
    purchaseTotal: string
    status: string
    transferNote: string
    /** Row line 2 for a transaction without a category. */
    uncategorizedTap: string
    uncategorized: string
    transferRow: string
    cardPaymentRow: string
    /** Text button next to the result count. */
    hiddenLink: (n: number) => string
    hiddenTitle: string
    hiddenNote: string
    hiddenEmpty: string
    unhide: string
    unhideAria: (description: string) => string
    subcategory: string
    newSubcategory: string
    subcategoryName: string
    add: string
    hide: string
    hideNote: string
    markOwnTransfer: string
    markOwnTransferNote: string
    notOwnTransfer: string
    markCardPayment: string
    markCardPaymentNote: string
    notCardPayment: string
    /** Clears the category and subcategory. */
    removeCategory: string
    cardPaymentNote: string
    noCategoriesOfType: (kind: string) => string
  }
  installments: {
    subtitle: string
    stillToPay: string
    summary: (n: number, lastMonth: string | null) => string
    committedPerMonth: string
    committedNote: string
    purchases: string
    purchase: string
    progress: string
    finished: string
    inProgress: string
    /** Label for the In progress / Paid off switch. */
    view: string
    bankLeft: string
    bankPurchases: (n: number) => string
    noneInProgress: string
    paid: string
    toGo: (n: number) => string
    paidOff: string
    chargedLabel: string
    perMonth: string
    leftToPay: string
    ends: string
    emptyTitle: string
    emptyBody: string
  }
  connect: {
    title: string
    intro: string
    button: string
    opening: string
    connected: string
    nextStep: string
    copy: string
    copied: string
    notConfigured: string
    meuPluggyMissing: string
    failed: string
  }
  accounts: {
    total: (banks: number) => string
    totalNote: string
    /** Label for an account the bank sent without a name, e.g. "USD balance". */
    balanceIn: (currency: string) => string
    footer: string
    signOut: string
    nearLimit: string
    currentBill: string
    /** A bill that has closed and is waiting to be paid. */
    closedBill: string
    /** Account labels on Accounts, by kind. */
    types: {
      checking: string
      savings: string
      usd: string
      card: string
    }
    /** Under a closed bill that's been partly paid; the amount shown is what's left. */
    alreadyPaid: (amount: string) => string
    closed: string
    /** Per-card closing and due days set by hand. */
    /** Renaming an account or card (kept across syncs). */
    rename: {
      action: (name: string) => string
      titleAccount: string
      titleCard: string
      label: string
      bankName: (name: string) => string
      note: string
      save: string
      cancel: string
      useBank: string
      tooLong: (max: number) => string
    }
    cardDays: {
      missing: string
      set: string
      summary: (close: number, due: number) => string
      edit: string
      closeDay: string
      dueDay: string
      save: string
      cancel: string
      useBank: string
      note: string
    }
    limitUsed: string
    used: string
    available: string
    limit: string
    futureInstallments: (amount: string) => string
    closes: string
    due: string
    rate: (currency: string, rate: string) => string
  }
  /** Bulk categorization on the Transactions screen. */
  bulk: {
    select: string
    exitSelect: string
    selected: (n: number) => string
    selectAll: string
    selectAllN: (n: number) => string
    selectAllAria: string
    clearSelection: string
    selectDay: (day: string) => string
    totalSelected: string
    categorizeN: (n: number) => string
    transfersNote: string
    mixedNote: string
    /** The bulk choice that clears the category and subcategory. */
    uncategorize: string
    uncategorizeNote: string
    total: string
    current: string
    resultLabel: (n: number) => string
    pickCategory: string
    pickSubcategory: string
    cancel: string
    apply: (n: number) => string
    saving: string
    updated: (n: number) => string
    undo: string
    undone: string
    undoFailed: string
    panelNote: string
  }
  /** Server errors, by the code the API returns (never its text, which is English and technical). */
  errors: {
    database: string
    schemaOutdated: string
    missingRate: string
    invalid: string
    notFound: string
    nameTaken: string
    network: string
    bulkTransfer: string
    bulkMixedTypes: string
    bulkCategoryType: string
    bulkSubcategory: string
    nothingSelected: string
    notIncome: string
    http: (status: number) => string
  }
  categoriesPage: {
    /** Accessible names of the 54 category icons, by key. */
    iconNames: Record<string, string>
    title: string
    newCategory: string
    typeAria: string
    subCount: (n: number) => string
    add: string
    editCategory: string
    listNote: string
    empty: string
    editTitle: string
    newTitle: string
    save: string
    name: string
    type: string
    expense: string
    income: string
    color: string
    icon: string
    subcategories: string
    addSubcategory: string
    link: string
    linkPlaceholder: string
    linkNote: string
    deleteCategory: string
    deleteConfirm: (name: string) => string
    deleteSubConfirm: (name: string) => string
    transactionsN: (n: number) => string
    remove: (name: string) => string
    nameTaken: string
    nameRequired: string
    noSubcategories: string
  }
  sync: {
    syncedToday: (time: string) => string
    syncedYesterday: (time: string) => string
    syncedOn: (date: string, time: string) => string
    stale: (days: number) => string
    syncing: (bank: string | null, n: number, total: number) => string
    failed: (banks: string, _count: number) => string
    failedAll: string
    neverSynced: string
    notConnected: string
    syncNow: string
    syncingButton: string
    retry: string
    connect: string
    done: (inserted: number, updated: number) => string
    view: string
    progress: string
    saveFailed: string
    /** Why a bank didn't sync, under the failure message. */
    problems: {
      credentials: string
      notFound: string
      rateLimited: string
      unavailable: string
      timeout: string
      database: string
      notConfigured: string
      network: string
      unknown: string
    }
    problemFor: (bank: string, reason: string) => string
    /** A connection Pluggy marks as needing attention (expired consent…). */
    reconnect: (banks: string) => string
    reconnectNote: string
  }
  /** Month-end projection, unusual categories and recurring charges. */
  insights: {
    back: string
    projection: {
      title: string
      today: (date: string) => string
      shouldRemain: (date: string) => string
      range: (min: string, max: string) => string
      lowNote: (value: string, date: string, beforeSalary: boolean) => string
      lowShort: (value: string, date: string) => string
      todayTag: string
      chart: (today: string, low: string, lowDate: string, end: string, endDate: string) => string
      tooltipProjected: string
      tooltipActual: string
      lines: { saldoHoje: string; receitas: string; faturas: string; recorrentes: string; diaADia: string; total: string }
      tiles: { saldoHoje: string; receitas: string; faturas: string; recorrentes: string; diaADia: string }
      seeDetails: string
      seeDetailsShort: string
      subtitle: (month: string, today: string) => string
      legend: { actual: string; projected: string; band: string }
      howTitle: string
      howSub: string
      waterfall: { saldo: string; receitas: string; faturas: string; recorrentes: string; diaADia: string; sobra: string }
      waterfallChart: (saldo: string, receitas: string, faturas: string, recorrentes: string, diaADia: string, end: string) => string
      notes: {
        saldo: (accounts: string) => string
        receitas: (day: number | null, freelance: boolean) => string
        receitasNone: string
        faturas: (cards: string, installments: string) => string
        faturasNone: string
        recorrentes: (names: string) => string
        recorrentesNone: string
        diaADia: (perDay: string) => string
        diaADiaOff: string
      }
      nextTitle: string
      nextNone: string
      event: {
        bill: (bank: string) => string
        billMeta: string
        billMetaInstallments: (amount: string) => string
        recurringMeta: (method: string) => string
        salary: string
        freelance: string
        estimated: string
      }
      methods: { card: string; debit: string; pix: string; boleto: string }
      settingsTitle: string
      accountsLabel: string
      accountsDefault: string
      dailyLabel: string
      dailyNote: string
      freelanceLabel: string
      freelanceNote: string
      accountsSheetNote: string
      apply: string
      atLeastOne: string
      empty: string
      and: string
      /** "Unimed, Aluguel e mais 4". */
      andMore: (names: string, n: number) => string
    }
    unusual: {
      title: string
      subMonth: (month: string) => string
      subMtd: (month: string, day: number) => string
      subDesktop: (month: string, from: string, to: string) => string
      subDesktopMtd: (month: string, day: number) => string
      headline: (name: string, pct: string, delta: string, above: boolean) => string
      compare: (now: string, month: string, avg: string) => string
      compareShort: (now: string, avg: string) => string
      rowLabel: (name: string, pct: string, above: boolean, normal: boolean) => string
      legend: { above: string; below: string; band: string }
      normalLabel: string
      normalItem: (name: string, pct: string) => string
      seeAll: string
      allNormal: string
      allTitle: string
      allSub: (month: string) => string
      detail: {
        subUnusual: (month: string) => string
        subNormal: (month: string) => string
        vs: (month: string, from: string, to: string) => string
        vsMtd: (month: string, day: number) => string
        above: string
        below: string
        compare: (now: string, month: string, avg: string, delta: string) => string
        avgLabel: (amount: string) => string
        chart: (name: string, months: string, avg: string) => string
        legendAvg: string
        driversUp: string
        driversDown: string
        driversSub: (month: string) => string
        legendAvgShort: string
        subNote: (now: string, avg: string) => string
        countNote: (count: number, month: string, avg: string) => string
        insideBand: string
        noSubcategory: string
        factShare: (name: string, pct: string, delta: string, total: string, up: boolean) => string
        factNext: (month: string, name: string, amount: string) => string
        factNextMtd: (month: string, name: string, amount: string) => string
        seeTransactions: (name: string) => string
        notFound: string
      }
    }
    recurring: {
      title: string
      cardTitle: string
      subtitle: string
      activeCount: (n: number) => string
      perMonth: string
      perYear: string
      totalsNote: (n: number, hasYearly: boolean) => string
      desktopSub: (n: number) => string
      seeAll: string
      badge: { up: string; upLong: string; new: string; stopped: string }
      short: {
        up: (from: string, to: string, yearly: boolean) => string
        new: (amount: string, yearly: boolean, since: string) => string
        stopped: (amount: string, since: string) => string
      }
      alertsTitle: (n: number) => string
      head: {
        up: (from: string, to: string) => string
        new: (amount: string, foreign: string | null, yearly: boolean) => string
        stopped: (date: string) => string
      }
      body: {
        up: (pct: string, date: string, perYear: string) => string
        new: (dates: string, account: string, perYear: string) => string
        stopped: (amount: string, month: string) => string
      }
      actions: { understood: string; seeCharges: string; notRecurring: string; confirm: string; stillPaying: string; markCancelled: string }
      largestFirst: string
      meta: { monthly: (day: number, account: string) => string; yearly: (month: string, perMonth: string) => string }
      per: { month: string; year: string; yearDesktop: (perMonth: string) => string }
      freq: { monthly: (day: number) => string; yearly: (month: string) => string }
      stoppedTitle: (n: number) => string
      stoppedMeta: (date: string) => string
      footer: string
      empty: string
      table: { name: string; frequency: string; account: string; amount: string }
      account: { card: (bank: string) => string; debit: (bank: string) => string; pix: (bank: string) => string; boleto: (bank: string) => string }
      historyTitle: string
      historyCount: (n: number) => string
      priceChart: (name: string, prices: string) => string
      flagUp: (delta: string) => string
      dates: (list: string[]) => string
    }
  }
}

export const messages: Messages = {
  nav: { overview: 'Visão geral', transactions: 'Transações', accounts: 'Contas', installments: 'Parcelas', categories: 'Categorias' },
  mainNav: 'Principal',
  demoData: 'Dados de exemplo',
  demoNote: 'Mostrando dados de exemplo até o Meu Pluggy ser conectado.',
  loading: 'Carregando suas finanças',
  loadErrorTitle: 'Não foi possível carregar suas finanças',
  loadErrorBody: 'Verifique sua conexão e tente de novo. Nada foi alterado; seus dados estão seguros.',
  tryAgain: 'Tentar de novo',
  previousMonth: 'Mês anterior',
  nextMonth: 'Próximo mês',
  income: 'Receitas',
  expenses: 'Despesas',
  transfers: 'Transferências',
  net: 'Saldo',
  seeAll: 'Ver todas',
  pending: 'Pendente',
  close: 'Fechar',
  done: 'Concluir',
  category: 'Categoria',
  other: 'Outros',
  chartTotal: 'Total',
  cardOf: (institution) => `Cartão ${institution}`,
  oneUnitIs: (currency, rate) => `1 ${currency} = R$ ${rate}`,

  overview: {
    subtitle: (date) => `Posição em ${date}`,
    netWorth: 'Patrimônio líquido',
    netWorthNote: 'Saldo das contas menos as faturas dos cartões, como os bancos informam',
    inAccounts: 'Em contas',
    cardBills: 'Faturas dos cartões',
    debtShare: (pct) => `As faturas equivalem a ${pct} do saldo em contas`,
    byBankNet: 'Por banco · contas menos cartões',
    avgIncome: {
      title: 'Renda média',
      sub: (months) => `Média mensal dos últimos ${months} ${months === 1 ? 'mês completo' : 'meses completos'}`,
      perMonth: '/mês',
      range: (lowest, lowMonth, highest, highMonth) => `Menor ${lowest} (${lowMonth}) · Maior ${highest} (${highMonth})`,
      current: (amount, pct, above) => `Este mês: ${amount} · ${pct} ${above ? 'acima' : 'abaixo'} da média`,
      currentNone: (amount) => `Este mês: ${amount}`,
      avgLabel: (amount) => `média ${amount}`,
      chart: (average) => `Renda por mês; média ${average}`,
      filter: {
        all: 'Todas as receitas',
        partial: '(parcial)',
        count: (n, total) => `${n} de ${total}`,
        aria: (names, n, total) => `Categorias consideradas na renda média: ${names}, ${n} de ${total}. Alterar`,
        and: 'e',
        title: 'Categorias da renda média',
        desc: 'Escolha quais receitas entram no cálculo. A escolha fica salva e vale também no desktop.',
        listLabel: 'Receitas',
        avgCol: 'Média/mês',
        uncategorizedNote: 'Pix e depósitos',
        resultLabel: 'Renda média com esta seleção',
        allLabel: 'Com todas:',
        markAll: 'Marcar todas',
        apply: 'Aplicar',
        saving: 'Salvando…',
        noneHint: 'Selecione pelo menos uma categoria',
        expand: (name) => `Mostrar subcategorias de ${name}`,
        collapse: (name) => `Recolher subcategorias de ${name}`,
      },
    },
    whereMoney: 'Onde está seu dinheiro',
    balancesNote: 'Saldos das contas, antes das faturas',
    byCurrency: 'Por moeda',
    byBank: 'Por banco',
    incomeVsExpenses: 'Receitas vs. despesas',
    lastMonths: (months) => (months === 12 ? 'Últimos 12 meses' : `Últimos ${months} meses`),
    range: { label: 'Período dos gráficos', months: (n) => `${n} meses`, year: '1 ano' },
    kept: 'da receita do mês foi guardado',
    keptShort: 'Guardado no mês',
    comingUp: 'Próximos pagamentos',
    openCardBills: 'Faturas em aberto',
    due: (date) => `Vence ${date}`,
    installmentsNextMonth: 'Parcelas do próximo mês',
    nextMonthPurchases: (month, n) => `${month} · ${n} ${n === 1 ? 'compra' : 'compras'}`,
    spendingByCategory: 'Gastos por categoria',
    monthInDetail: 'Mês em detalhe',
    categories: 'Categorias',
    noExpenses: 'Nenhuma despesa neste mês.',
    latestTransactions: 'Últimas transações',
  },

  transactions: {
    search: 'Buscar transações',
    billChip: (closed, from, to) => `${closed ? 'Fatura fechada' : 'Fatura atual'} · ${from} – ${to}`,
    billShowAll: 'Ver todas as transações deste cartão',
    billTotal: (amount) => `Total da fatura ${amount}`,
    billExpected: (amount) => `Inclui ${amount} em parcelas que ainda não entraram.`,
    allMonths: 'Todos os meses',
    fetchingStored: 'Buscando as transações salvas…',
    fetchStoredFailed: 'Não foi possível buscar as transações salvas.',
    type: 'Tipo',
    allTypes: 'Todos os tipos',
    account: 'Conta',
    allAccounts: 'Todas as contas',
    allCategories: 'Todas as categorias',
    clear: 'Limpar',
    clearFilters: 'Limpar filtros',
    colDescription: 'Descrição',
    colAmount: 'Valor',
    count: (n, month) =>
      `${n} ${n === 1 ? 'transação' : 'transações'}${month ? ` em ${month.replace(/ de \d{4}$/, '').toLowerCase()}` : ''}`,
    emptyTitle: 'Nenhuma transação encontrada',
    emptyBody: (month) =>
      month
        ? `Nada em ${month.replace(/ de \d{4}$/, '').toLowerCase()} corresponde a esses filtros. Tente outro mês ou limpe os filtros.`
        : 'Nada corresponde a esses filtros. Tente limpá-los.',
    details: 'Detalhes da transação',
    kindIncome: 'Receita',
    kindExpense: 'Despesa',
    kindTransfer: 'Transferência',
    installmentN: (n, total) => `parcela ${n} de ${total}`,
    date: 'Data',
    inBRL: 'Em reais',
    installment: 'Parcela',
    installmentEnds: (n, total, month) => `${n} de ${total} · termina ${month}`,
    purchaseTotal: 'Total da compra',
    status: 'Situação',
    transferNote: 'Transferências não contam como receita nem despesa.',
    uncategorizedTap: 'Sem categoria · toque para escolher',
    uncategorized: 'Sem categoria',
    transferRow: 'Transferência entre suas contas',
    cardPaymentRow: 'Pagamento de fatura',
    hiddenLink: (n) => `Ocultas (${n})`,
    hiddenTitle: 'Transações ocultas',
    hiddenNote: 'Transações ocultas ficam fora de todos os totais, gráficos e médias. Reexiba uma para ela voltar a contar.',
    hiddenEmpty: 'Nenhuma transação oculta.',
    unhide: 'Reexibir',
    unhideAria: (description) => `Reexibir ${description}`,
    subcategory: 'Subcategoria',
    newSubcategory: 'Nova',
    subcategoryName: 'Nome da subcategoria',
    add: 'Adicionar',
    hide: 'Ocultar esta transação',
    hideNote: 'Fica fora dos totais e gráficos. Encontre de novo em Transações › Ocultas.',
    markOwnTransfer: 'Marcar como transferência entre suas contas',
    markOwnTransferNote: 'Não conta como receita nem despesa: o dinheiro só mudou de conta.',
    notOwnTransfer: 'Não é transferência entre suas contas',
    markCardPayment: 'Marcar como pagamento de fatura',
    markCardPaymentNote: 'Não conta como despesa: as compras do cartão já contam.',
    notCardPayment: 'Não é pagamento de fatura',
    removeCategory: 'Remover categoria',
    cardPaymentNote: 'Pagamentos de fatura não contam como despesa: as compras do cartão já contam. Continua no saldo da conta e na fatura.',
    noCategoriesOfType: (kind) => `Nenhuma categoria de ${kind} ainda. Crie uma em Categorias.`,
  },

  installments: {
    subtitle: 'Compras no cartão divididas em parcelas mensais',
    stillToPay: 'Falta pagar',
    summary: (n, lastMonth) => `${n} ${n === 1 ? 'compra' : 'compras'}${lastMonth ? ` · última parcela em ${lastMonth}` : ''}`,
    committedPerMonth: 'Comprometido por mês',
    committedNote: 'Já descontado do limite dos cartões. Novas compras vão somar a essas faturas.',
    purchases: 'Compras parceladas',
    purchase: 'Compra',
    progress: 'Andamento',
    finished: 'Quitadas',
    inProgress: 'Em andamento',
    view: 'Parcelas a mostrar',
    bankLeft: 'falta pagar',
    bankPurchases: (n) => `${n} ${n === 1 ? 'compra' : 'compras'}`,
    noneInProgress: 'Nada em andamento: todas as compras parceladas estão quitadas.',
    paid: 'pagas',
    toGo: (n) => `${n} ${n === 1 ? 'restante' : 'restantes'}`,
    paidOff: 'Quitada',
    chargedLabel: 'Parcelas cobradas',
    perMonth: 'Por mês',
    leftToPay: 'Falta pagar',
    ends: 'Termina',
    emptyTitle: 'Nenhuma compra parcelada',
    emptyBody: 'Quando você parcelar uma compra no cartão, ela aparece aqui com o andamento das parcelas.',
  },

  connect: {
    title: 'Conectar seus bancos',
    intro: 'O Trove lê suas contas pelo Meu Pluggy. Conecte uma vez para obter o ID da conexão.',
    button: 'Conectar Meu Pluggy',
    opening: 'Abrindo…',
    connected: 'Conectado',
    nextStep: 'Copie este ID no Vercel como PLUGGY_ITEM_IDS e faça um novo deploy.',
    copy: 'Copiar',
    copied: 'Copiado',
    notConfigured: 'Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Vercel e faça um novo deploy.',
    meuPluggyMissing: 'O Meu Pluggy não está disponível para essas credenciais; nada foi aberto (para evitar conexões pagas).',
    failed: 'Não foi possível conectar. Tente de novo.',
  },

  accounts: {
    total: (banks) => `Total ${banks === 1 ? 'no banco' : `nos ${banks} bancos`}`,
    totalNote: 'Saldos menos as faturas em aberto',
    balanceIn: (currency) => `Saldo em ${currency}`,
    footer: 'Dados de exemplo. Suas contas reais aparecem aqui quando o Meu Pluggy for conectado.',
    signOut: 'Sair',
    nearLimit: 'Perto do limite',
    currentBill: 'Fatura atual',
    closedBill: 'Fatura fechada',
    types: { checking: 'Conta corrente', savings: 'Poupança', usd: 'Saldo em dólar', card: 'Cartão de crédito' },
    alreadyPaid: (amount) => `${amount} já pago`,
    closed: 'Fechou em',
    rename: {
      action: (name) => `Renomear ${name}`,
      titleAccount: 'Renomear conta',
      titleCard: 'Renomear cartão',
      label: 'Nome no Trove',
      bankName: (name) => `Nome no banco: ${name}`,
      note: 'Só muda no Trove. A sincronização mantém este nome.',
      save: 'Salvar',
      cancel: 'Cancelar',
      useBank: 'Usar o nome do banco',
      tooLong: (max) => `Use até ${max} caracteres.`,
    },
    cardDays: {
      missing: 'O banco não informa a data de fechamento deste cartão, então não dá para calcular a fatura atual. Informe os dias pelo app do banco.',
      set: 'Definir dias de fechamento e vencimento',
      summary: (close, due) => `Fecha no dia ${close} · vence no dia ${due}`,
      edit: 'Editar',
      closeDay: 'Dia de fechamento',
      dueDay: 'Dia de vencimento',
      save: 'Salvar',
      cancel: 'Cancelar',
      useBank: 'Usar as datas do banco',
      note: 'Salvo neste aparelho.',
    },
    limitUsed: 'Limite usado',
    used: 'Usado',
    available: 'Disponível',
    limit: 'Limite',
    futureInstallments: (amount) => `${amount} em parcelas futuras`,
    closes: 'Fecha em',
    due: 'Vence em',
    rate: (currency, rate) => `Cotação 1 ${currency} = R$ ${rate}`,
  },

  bulk: {
    select: 'Selecionar',
    exitSelect: 'Sair da seleção',
    selected: (n) => (n === 1 ? '1 selecionada' : `${n} selecionadas`),
    selectAll: 'Selecionar tudo',
    selectAllN: (n) => (n === 1 ? 'Selecionar a 1' : `Selecionar as ${n}`),
    selectAllAria: 'Selecionar todas as transações visíveis',
    clearSelection: 'Limpar seleção',
    selectDay: (day) => `Selecionar todas de ${day}`,
    totalSelected: 'Total selecionado',
    categorizeN: (n) => (n === 1 ? 'Categorizar 1 transação' : `Categorizar ${n} transações`),
    transfersNote: 'Transferências entre suas contas não têm categoria e não podem ser selecionadas.',
    mixedNote: 'Para escolher uma categoria, selecione só despesas ou só receitas. Sem categoria vale para qualquer seleção.',
    uncategorize: 'Sem categoria',
    uncategorizeNote: 'Remove a categoria e a subcategoria',
    total: 'Total',
    current: 'Hoje estão em',
    resultLabel: (n) => (n === 1 ? 'A 1 vai para' : `As ${n} vão para`),
    pickCategory: 'Escolha a categoria',
    pickSubcategory: 'Escolha a subcategoria',
    cancel: 'Cancelar',
    apply: (n) => `Aplicar a ${n}`,
    saving: 'Salvando…',
    updated: (n) => (n === 1 ? '1 transação atualizada' : `${n} transações atualizadas`),
    undo: 'Desfazer',
    undone: 'Alteração desfeita',
    undoFailed: 'Não foi possível desfazer. Tente de novo.',
    panelNote: 'Shift + clique seleciona um intervalo. Transferências entre suas contas não podem ser selecionadas.',
  },
  errors: {
    database: 'O banco de dados não respondeu. Tente de novo em instantes.',
    schemaOutdated: 'As tabelas do banco de dados estão desatualizadas: rode os arquivos pendentes de db/migrations (docs/neon-setup.md).',
    missingRate: 'Sem cotação para converter uma moeda estrangeira. Sincronize de novo.',
    invalid: 'A alteração não é válida.',
    notFound: 'Isso não existe mais. Os dados foram recarregados.',
    nameTaken: 'Já existe uma com esse nome.',
    network: 'Não foi possível acessar o servidor do Trove. Verifique a conexão.',
    bulkTransfer: 'Transferências entre suas contas e pagamentos de fatura não têm categoria.',
    bulkMixedTypes: 'Selecione só despesas ou só receitas para categorizar.',
    bulkCategoryType: 'Essa categoria não é do mesmo tipo das transações.',
    bulkSubcategory: 'Essa subcategoria é de outra categoria.',
    nothingSelected: 'Selecione pelo menos uma categoria',
    notIncome: 'Só categorias de receita entram na renda média.',
    http: (status) => `A requisição falhou (HTTP ${status}).`,
  },
  categoriesPage: {
    iconNames: {
      home: 'Casa',
      bolt: 'Energia',
      droplet: 'Água',
      flame: 'Gás',
      wifi: 'Internet',
      phone: 'Telefone',
      cart: 'Mercado',
      fork: 'Restaurante',
      coffee: 'Café',
      pizza: 'Fast food',
      beer: 'Bar',
      delivery: 'Delivery',
      car: 'Carro',
      bus: 'Ônibus',
      fuel: 'Combustível',
      parking: 'Estacionamento',
      bag: 'Compras',
      shirt: 'Roupas',
      package: 'Pedidos online',
      gift: 'Presentes',
      lipstick: 'Beleza',
      laptop: 'Eletrônicos',
      heart: 'Saúde',
      pill: 'Farmácia',
      stethoscope: 'Médico',
      tooth: 'Dentista',
      dumbbell: 'Academia',
      scissors: 'Cabelo e estética',
      users: 'Família',
      stroller: 'Filhos',
      paw: 'Pets',
      backpack: 'Escola',
      book: 'Livros',
      cap: 'Cursos',
      briefcase: 'Trabalho',
      monitor: 'Software',
      game: 'Jogos',
      film: 'Cinema',
      music: 'Música',
      repeat: 'Assinaturas',
      ball: 'Esportes',
      plane: 'Voos',
      suitcase: 'Bagagem',
      beach: 'Férias',
      coin: 'Dinheiro',
      banknote: 'Espécie',
      bank: 'Banco',
      card: 'Cartão',
      piggy: 'Poupança',
      chart: 'Investimentos',
      receipt: 'Contas',
      shield: 'Seguros',
      star: 'Favoritos',
      more: 'Outros',
    },
    title: 'Categorias',
    newCategory: 'Nova',
    typeAria: 'Tipo de categoria',
    subCount: (n) => `${n} ${n === 1 ? 'subcategoria' : 'subcategorias'}`,
    add: 'Adicionar',
    editCategory: 'Editar categoria',
    listNote: 'Toque numa categoria para ver as subcategorias. As transações mantêm a categoria mesmo se você renomeá-la.',
    empty: 'Nenhuma categoria deste tipo ainda.',
    editTitle: 'Editar categoria',
    newTitle: 'Nova categoria',
    save: 'Salvar',
    name: 'Nome',
    type: 'Tipo',
    expense: 'Despesa',
    income: 'Receita',
    color: 'Cor',
    icon: 'Ícone',
    subcategories: 'Subcategorias',
    addSubcategory: 'Adicionar subcategoria',
    link: 'Vincular subcategoria existente',
    linkPlaceholder: 'Escolher de outra categoria…',
    linkNote: 'Vincular move a subcategoria para cá, junto com as transações dela.',
    deleteCategory: 'Excluir categoria',
    deleteConfirm: (name) => `Excluir “${name}”? As subcategorias também são excluídas, e as transações ficam sem categoria.`,
    deleteSubConfirm: (name) => `Remover “${name}”? As transações continuam na categoria, sem subcategoria.`,
    transactionsN: (n) => `${n} ${n === 1 ? 'transação' : 'transações'}`,
    remove: (name) => `Remover ${name}`,
    nameTaken: 'Use um nome que ainda não exista.',
    nameRequired: 'Dê um nome.',
    noSubcategories: 'Nenhuma subcategoria ainda.',
  },

  sync: {
    syncedToday: (time) => `Sincronizado hoje às ${time}`,
    syncedYesterday: (time) => `Sincronizado ontem às ${time}`,
    syncedOn: (date, time) => `Sincronizado em ${date} às ${time}`,
    stale: (days) => `Última sincronização há ${days} dias`,
    syncing: (bank, n, total) =>
      total === 1 ? `Sincronizando ${bank ?? 'seu banco'}…` : `Sincronizando ${bank ?? `banco ${n}`}… ${n} de ${total} bancos`,
    failed: (banks, count) => `${banks} não ${count === 1 ? 'sincronizou' : 'sincronizaram'}. Os outros bancos estão atualizados.`,
    failedAll: 'Não foi possível sincronizar. Verifique sua conexão e tente de novo.',
    neverSynced: 'Mostrando dados de exemplo. Sincronize para carregar seus bancos.',
    notConnected: 'Mostrando dados de exemplo. Conecte o Meu Pluggy para sincronizar.',
    syncNow: 'Sincronizar',
    syncingButton: 'Sincronizando',
    retry: 'Tentar de novo',
    connect: 'Conectar',
    done: (inserted, updated) =>
      `Sincronizado · ${inserted} ${inserted === 1 ? 'nova' : 'novas'}, ${updated} ${updated === 1 ? 'atualizada' : 'atualizadas'}`,
    view: 'Ver',
    progress: 'Progresso da sincronização',
    saveFailed: 'Não foi possível salvar a alteração. Mostrando o que está salvo.',
    problems: {
      credentials: 'O Pluggy recusou as credenciais da API. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Vercel.',
      notFound: 'O Pluggy não conhece esta conexão. Confira PLUGGY_ITEM_IDS no Vercel.',
      rateLimited: 'O Pluggy está limitando as requisições. Tente de novo em alguns minutos.',
      unavailable: 'O Pluggy ou o banco não respondeu. Tente de novo mais tarde.',
      timeout: 'Demorou demais e foi interrompida. Tente de novo.',
      database: 'O banco de dados recusou a atualização. Confira se as migrações de db/migrations foram executadas.',
      notConfigured: 'O Pluggy ou o banco de dados não está configurado no servidor.',
      network: 'Não foi possível acessar o servidor do Trove. Verifique a conexão.',
      unknown: 'Algo deu errado. Tente de novo.',
    },
    problemFor: (bank, reason) => `${bank}: ${reason}`,
    reconnect: (banks) => `${banks} precisa ser reconectado no app Meu Pluggy.`,
    reconnectNote: 'Os dados param de atualizar até lá. Reconecte e depois sincronize.',
  },
  insights: {
    back: 'Visão geral',
    projection: {
      title: 'Previsão do fim do mês',
      today: (date) => `hoje, ${date}`,
      shouldRemain: (date) => `Deve sobrar em ${date}`,
      range: (min, max) => `Entre ${min} e ${max}, conforme a renda e os gastos`,
      lowNote: (value, date, beforeSalary) => `Ponto mais baixo: ${value} em ${date}${beforeSalary ? ', antes do salário' : ''}`,
      lowShort: (value, date) => `Mín. ${value} · ${date}`,
      todayTag: 'hoje',
      chart: (today, low, lowDate, end, endDate) => `Saldo previsto dia a dia: ${today} hoje, mínimo de ${low} em ${lowDate}, ${end} em ${endDate}`,
      tooltipProjected: 'Previsto',
      tooltipActual: 'Saldo real',
      lines: {
        saldoHoje: 'Saldo hoje',
        receitas: '+ Receitas previstas',
        faturas: '− Faturas a pagar',
        recorrentes: '− Recorrentes no débito e Pix',
        diaADia: '− Gastos do dia a dia',
        total: '= Deve sobrar',
      },
      tiles: { saldoHoje: 'Saldo hoje', receitas: '+ Receitas', faturas: '− Faturas', recorrentes: '− Recorrentes', diaADia: '− Dia a dia' },
      seeDetails: 'Ver detalhes da previsão',
      seeDetailsShort: 'Ver detalhes',
      subtitle: (month, today) => `${month} · atualizada hoje, ${today}`,
      legend: { actual: 'Saldo real', projected: 'Previsto', band: 'Margem' },
      howTitle: 'Como chegamos nesse valor',
      howSub: 'Cada valor entra uma vez só',
      waterfall: { saldo: 'Saldo hoje', receitas: 'Receitas', faturas: 'Faturas', recorrentes: 'Recorr.', diaADia: 'Dia a dia', sobra: 'Sobra' },
      waterfallChart: (saldo, receitas, faturas, recorrentes, diaADia, end) =>
        `Saldo hoje ${saldo}, mais receitas ${receitas}, menos faturas ${faturas}, menos recorrentes ${recorrentes}, menos dia a dia ${diaADia}, igual a ${end}`,
      notes: {
        saldo: (accounts) => `Contas: ${accounts}`,
        receitas: (day, freelance) =>
          `${freelance ? 'Salário e freelance' : 'Salário'}, média de 6 meses${day ? ` · cai por volta do dia ${day}` : ''}`,
        receitasNone: 'O salário deste mês já entrou',
        faturas: (cards, installments) => `${cards} · já incluem ${installments} em parcelas`,
        faturasNone: 'Nenhuma fatura vence até o fim do mês',
        recorrentes: (names) => `${names} · as do cartão já estão nas faturas`,
        recorrentesNone: 'Nenhuma até o fim do mês · as do cartão já estão nas faturas',
        diaADia: (perDay) => `${perDay} por dia no débito e Pix, média de 3 meses`,
        diaADiaOff: 'Fora do cálculo',
      },
      nextTitle: 'Próximos lançamentos',
      nextNone: 'Nada previsto até o fim do mês.',
      event: {
        bill: (bank) => `Fatura ${bank}`,
        billMeta: 'Cartão de crédito',
        billMetaInstallments: (amount) => `Cartão de crédito · inclui ${amount} em parcelas`,
        recurringMeta: (method) => `Recorrente · ${method}`,
        salary: 'Salário',
        freelance: 'Freelance',
        estimated: 'Estimado · média de 6 meses',
      },
      methods: { card: 'cartão', debit: 'débito', pix: 'Pix', boleto: 'boleto' },
      settingsTitle: 'O que entra no cálculo',
      accountsLabel: 'Contas consideradas',
      accountsDefault: 'sem poupança nem saldo em moeda estrangeira',
      dailyLabel: 'Incluir gastos do dia a dia',
      dailyNote: 'Estimativa do que sai no débito e Pix fora das recorrentes',
      freelanceLabel: 'Incluir freelance',
      freelanceNote: 'Renda que varia muito; fica de fora por padrão',
      accountsSheetNote: 'O saldo destas contas entra na previsão.',
      apply: 'Aplicar',
      atLeastOne: 'Escolha pelo menos uma conta.',
      empty: 'Ainda não há histórico suficiente para prever. Volte depois de 2 meses de dados.',
      and: 'e',
      andMore: (names, n) => `${names} e mais ${n}`,
    },
    unusual: {
      title: 'Fora do padrão',
      subMonth: (month) => `${month} comparado à média de cada categoria nos 6 meses anteriores`,
      subMtd: (month, day) => `${month} até o dia ${day}, comparado aos mesmos dias dos 6 meses anteriores`,
      subDesktop: (month, from, to) => `${month} vs. a média de cada categoria (${from}–${to})`,
      subDesktopMtd: (month, day) => `${month} até o dia ${day} vs. os mesmos dias dos 6 meses anteriores`,
      headline: (name, pct, delta, above) =>
        above ? `${name} está ${pct} acima da sua média de 6 meses (+${delta}).` : `${name} está ${pct} abaixo da sua média de 6 meses (−${delta}).`,
      compare: (now, month, avg) => `${now} em ${month} · média ${avg}`,
      compareShort: (now, avg) => `${now} · média ${avg}`,
      rowLabel: (name, pct, above, normal) =>
        `${name}: ${pct} ${above ? 'acima' : 'abaixo'} da média${normal ? ', dentro do normal' : ''}`,
      legend: { above: 'Acima da média', below: 'Abaixo da média', band: 'Faixa normal (±15%)' },
      normalLabel: 'Dentro do normal:',
      normalItem: (name, pct) => (pct ? `${name} (${pct})` : name),
      seeAll: 'Ver todas as categorias',
      allNormal: 'Tudo dentro do normal este mês',
      allTitle: 'Todas as categorias',
      allSub: (month) => `${month} comparado à média de cada categoria`,
      detail: {
        subUnusual: (month) => `Fora do padrão em ${month}`,
        subNormal: (month) => `Dentro do normal em ${month}`,
        vs: (month, from, to) => `${month} vs. média de ${from} a ${to}`,
        vsMtd: (month, day) => `${month} até o dia ${day} vs. os mesmos dias dos 6 meses anteriores`,
        above: 'acima da sua média',
        below: 'abaixo da sua média',
        compare: (now, month, avg, delta) => `${now} em ${month} · média ${avg} (${delta})`,
        avgLabel: (amount) => `média ${amount}`,
        chart: (name, months, avg) => `Gastos com ${name} por mês: ${months}. Média de 6 meses ${avg}.`,
        legendAvg: 'Média de 6 meses',
        driversUp: 'O que puxou o aumento',
        driversDown: 'O que puxou a queda',
        driversSub: (month) => `Por subcategoria, ${month} vs. média`,
        legendAvgShort: 'Média',
        subNote: (now, avg) => `${now} vs. média ${avg}`,
        countNote: (count, month, avg) => `${count} ${count === 1 ? 'lançamento' : 'lançamentos'} em ${month} · média de ${avg} por mês`,
        insideBand: 'Dentro do normal (±15%)',
        noSubcategory: 'Sem subcategoria',
        factShare: (name, pct, delta, total, up) => `${name} explica ${pct} ${up ? 'do aumento' : 'da queda'} (${delta} de ${total}).`,
        factNext: (month, name, amount) => `Se ${month} seguir a média, ${name} volta para cerca de ${amount}.`,
        factNextMtd: (month, name, amount) => `Se o resto de ${month} seguir a média, ${name} fecha em cerca de ${amount}.`,
        seeTransactions: (name) => `Ver transações de ${name}`,
        notFound: 'Esta categoria não tem comparação neste mês.',
      },
    },
    recurring: {
      title: 'Recorrentes',
      cardTitle: 'Assinaturas e recorrentes',
      subtitle: 'Cobranças que se repetem todo mês ou todo ano',
      activeCount: (n) => `Ativas · ${n}`,
      perMonth: 'Por mês',
      perYear: 'Por ano',
      totalsNote: (n, hasYearly) =>
        `Soma ${n === 1 ? 'da ativa' : `das ${n} ativas`}.${hasYearly ? ' A anual entra dividida por 12 no total por mês.' : ''} As paradas ficam fora.`,
      desktopSub: (n) => `${n} ${n === 1 ? 'ativa' : 'ativas'} · as paradas ficam fora dos totais`,
      seeAll: 'Ver todas as recorrentes',
      badge: { up: 'Aumento', upLong: 'Aumento de preço', new: 'Nova', stopped: 'Parou' },
      short: {
        up: (from, to, yearly) => `${from} → ${to} ${yearly ? 'por ano' : 'por mês'}`,
        new: (amount, yearly, since) => `≈ ${amount} ${yearly ? 'por ano' : 'por mês'} desde ${since}`,
        stopped: (amount, since) => `${amount} · sem cobrança desde ${since}`,
      },
      alertsTitle: (n) => `Alertas · ${n}`,
      head: {
        up: (from, to) => `${from} → ${to}`,
        new: (amount, foreign, yearly) => `${foreign ? `${foreign} ≈ ` : ''}${amount}/${yearly ? 'ano' : 'mês'}`,
        stopped: (date) => `Última cobrança: ${date}`,
      },
      body: {
        up: (pct, date, perYear) => `+${pct} desde ${date}${date.endsWith('.') ? '' : '.'} São ${perYear} a mais por ano.`,
        new: (dates, account, perYear) => `Cobrada em ${dates} · ${account}. Soma ${perYear} por ano.`,
        stopped: (amount, month) => `${amount} até ${month}. Nenhuma cobrança desde então.`,
      },
      actions: {
        understood: 'Entendi',
        seeCharges: 'Ver cobranças',
        notRecurring: 'Não é recorrente',
        confirm: 'Confirmar',
        stillPaying: 'Ainda pago',
        markCancelled: 'Marcar como cancelada',
      },
      largestFirst: 'Maior valor primeiro',
      meta: {
        monthly: (day, account) => `Todo dia ${day} · ${account}`,
        yearly: (month, perMonth) => `Anual · ${month} · ≈ ${perMonth}/mês`,
      },
      per: { month: 'por mês', year: 'por ano', yearDesktop: (perMonth) => `por ano (≈ ${perMonth}/mês)` },
      freq: { monthly: (day) => `Mensal · dia ${day}`, yearly: (month) => `Anual · ${month}` },
      stoppedTitle: (n) => `Paradas · ${n}`,
      stoppedMeta: (date) => `Última cobrança ${date} · fora dos totais`,
      footer:
        'Uma cobrança vira recorrente quando o mesmo estabelecimento cobra um valor parecido (até 10% de diferença) em 2 meses seguidos, ou 1 vez por ano em 2 anos. Toque numa linha para ver o histórico ou dizer que não é recorrente.',
      empty: 'Nenhuma cobrança recorrente encontrada ainda.',
      table: { name: 'Nome', frequency: 'Frequência', account: 'Conta', amount: 'Valor' },
      account: {
        card: (bank) => `Cartão ${bank}`,
        debit: (bank) => `Débito ${bank}`,
        pix: (bank) => `Pix ${bank}`,
        boleto: (bank) => `Boleto ${bank}`,
      },
      historyTitle: 'Histórico de cobranças',
      historyCount: (n) => `${n} ${n === 1 ? 'cobrança' : 'cobranças'}`,
      priceChart: (name, prices) => `Preço de ${name} por mês: ${prices}`,
      flagUp: (delta) => `+${delta}`,
      dates: (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`),
    },
  },
}
