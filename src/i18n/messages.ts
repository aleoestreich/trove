// UI strings, in Brazilian Portuguese (pt-BR): the app's only language.
//
// Transaction descriptions and account names are not translated: they are
// data from the banks (via Pluggy) and shown as the bank sends them.

import type { OverviewSection, SyncPeriod } from '../data/types.js'

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
  /** Privacy mode: amounts, charts and descriptions blurred, for public places. */
  /** TEMPORARY: the debug screen (#/debug), Pluggy's raw responses. */
  debug: {
    title: string
    link: string
    intro: string
    loading: string
    notConfigured: string
    failed: (status: number) => string
    item: (n: number) => string
    accountsHint: string
    itemCall: string
    accountsCall: string
    page: (n: number) => string
    transactions: string
    bills: string
    nextPage: string
    copy: string
    copied: string
    status: (status: number) => string
    identityCall: string
    investmentsCall: string
    loansCall: string
    investmentTransactions: string
    transactionsV1: string
    loadAll: string
    loadAllBanks: string
    loadingAll: (done: number) => string
    allTitle: string
    allNote: string
    download: string
  }
  fgts: {
    section: string
    outOfTotal: string
    trackLabel: string
    trackNote: string
    keptNote: (count: number) => string
    balanceOn: (date: string) => string
    due: string
    emptyTitle: string
    emptyNote: string
    explain: string
    update: string
    history: string
    sheet: {
      title: string
      editTitle: string
      subtitle: string
      balanceLabel: string
      balanceHint: string
    }
    list: {
      title: string
      subtitle: string
      emptyTitle: string
      emptyNote: string
      clear: string
      clearConfirm: string
      clearYes: string
      close: string
    }
    reminder: {
      title: string
      last: (date: string) => string
      first: string
      action: string
      later: string
    }
  }
  balance: {
    correcting: (date: string) => string
    balanceInvalid: string
    dateLabel: string
    today: (date: string) => string
    dateHint: string
    dateFuture: string
    save: string
    saveCorrection: string
    saving: string
    cancel: string
    failed: string
    delete: string
    deleteConfirm: (date: string) => string
    deleteYes: string
    chartTitle: string
    chartSince: (change: string, month: string) => string
    chartCount: (count: number) => string
    listLabel: string
    latest: string
    withdrawal: string
    first: string
    edit: (date: string) => string
    outOfTotal: string
  }
  pension: {
    section: string
    trackLabel: string
    trackNote: string
    keptNote: (count: number) => string
    plans: (count: number) => string
    dueCount: (count: number) => string
    add: string
    emptyTitle: string
    emptyNote: string
    balanceOn: (date: string) => string
    changeSince: (date: string) => string
    badgeUpdate: string
    badgeNew: string
    open: (name: string) => string
    plan: {
      addTitle: string
      editTitle: string
      subtitle: string
      nameLabel: string
      namePlaceholder: string
      nameHint: string
      nameEmpty: string
      typeLabel: string
      optional: string
      typeNone: string
      typeHint: string
      firstBalance: string
      balanceLabel: string
      firstHint: string
      keepHistory: (count: number) => string
      add: string
      save: string
      delete: string
      deleteConfirm: (name: string) => string
      deleteYes: string
      failed: string
    }
    detail: {
      subtitle: string
      edit: string
      emptyTitle: string
      emptyNote: string
      inform: string
      update: string
    }
    update: {
      title: string
      editTitle: string
      balanceLabel: string
      balanceHint: string
    }
    reminder: {
      title: string
      oneLate: (name: string) => string
      oneNew: (name: string) => string
      many: (count: number) => string
      chooseTitle: string
      chooseNote: string
      lastOn: (date: string) => string
      none: string
    }
  }
  balancesReminder: {
    title: string
    balanceOf: (date: string) => string
    planNew: string
    plansLate: (count: number) => string
    plansLabel: string
    update: string
  }
  outOfTotal: {
    title: string
    manual: string
    whyLabel: string
    whyBoth: string
    whyFgts: string
    whyPension: string
  }
  privacy: {
    hide: string
    show: string
    on: string
    showShort: string
    turnedOn: string
    staysOn: string
    chartHidden: string
    comparisonsHidden: string
  }
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
    /** "Patrimônio líquido · hoje": today's value only, what it is made of, and when it was updated. */
    netWorth: string
    accountsLink: string
    inAccounts: string
    cardBills: string
    bankStale: (bank: string, date: string) => string
    negativeNote: string
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
    /** The section of the multi-month charts, with the period picker. */
    trend: string
    /** "abr. a set. 2026", "out. 2025 a set. 2026". */
    span: (from: string, to: string) => string
    shortHistory: (month: string) => string
    kept: string
    keptShort: string
    comingUp: string
    openCardBills: string
    due: (date: string) => string
    installmentsNextMonth: string
    nextMonthPurchases: (month: string, n: number) => string
    spendingByCategory: string
    monthInDetail: string
    /** "Personalizar": the order of the cards and the hidden ones, shared by every device. */
    layout: {
      open: string
      title: string
      sub: string
      sections: Record<OverviewSection, string>
      moveUp: (name: string) => string
      moveDown: (name: string) => string
      show: (name: string) => string
      hiddenTag: string
      /** Under "13º e férias" while it's turned off. */
      extraPayOff: string
      /** Under "A receber" while nobody owes anything. */
      receivablesNone: string
      /** Under "Fechamento do mês" after the 10th. */
      monthCloseOff: string
      shownCount: (n: number, total: number) => string
      reset: string
      cancel: string
      save: string
      failed: string
      allHidden: string
    }
    /** Under the month picker: "Mês atual · até hoje, 8 out." or "Mês fechado". */
    currentMonth: (day: string) => string
    closedMonth: string
    fetchingMonth: (month: string) => string
    fetchMonthFailed: (month: string) => string
    topCategories: string
    /** "Escolher mês": every month stored, by year. */
    monthPicker: {
      open: (month: string) => string
      title: string
      subtitle: string
      current: string
      count: (n: number) => string
      onServer: string
    }
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
    /** For one month ("de março de 2026"), or every month (null). */
    fetchStoredFailed: (month: string | null) => string
    retrying: string
    storedPending: (month: string | null) => string
    monthSheet: { title: string; subtitle: string; allNote: string }
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
    investmentRow: string
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
    markInvestment: string
    markInvestmentNote: string
    notInvestment: string
    investmentNote: string
    /** Clears the category and subcategory. */
    removeCategory: string
    uncategorizedNote: string
    categoryRemoved: string
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
      title: string
      bankNameLabel: string
      label: string
      note: string
      emptyNote: string
      clear: string
      save: string
      saving: string
      cancel: string
      useBank: string
      failed: string
      saved: string
      restored: string
      undo: string
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
      useEstimate: string
      useBills: string
      note: string
      estimated: (close: number, due: number) => string
      fromBills: (close: number, due: number) => string
      estimatedFrom: (bills: number) => string
      fromClosings: (bills: number) => string
      adjust: string
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
    resultLabel: string
    clearResult: (n: number) => string
    pickCategory: string
    pickFirst: string
    optional: string
    tapAgain: (name: string) => string
    noSubcategory: string
    remove: (n: number) => string
    failed: string
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
  /** "Fechamento do mês": the summary of a month once it ends (src/data/monthClose.ts). */
  monthClose: {
    title: (month: string) => string
    sub: string
    cardTitle: (month: string) => string
    kept: (amount: string) => string
    overspent: (amount: string) => string
    keptPct: (pct: string) => string
    noIncome: string
    income: string
    expenses: string
    net: string
    changedTitle: string
    vsPrevious: (month: string) => string
    vsAverageShort: string
    changedSub: (previous: string | null, months: number | null) => string
    noPrevious: string
    movers: string
    moverWas: (before: string) => string
    biggestTitle: string
    byCategory: string
    share: (pct: string) => string
    largest: string
    unusualTitle: string
    unusualRow: (pct: string, above: boolean, avg: string) => string
    unusualNone: string
    unusualNoHistory: string
    goalsTitle: string
    goalsTarget: (pct: string) => string
    goalsOpen: string
    goalsNone: string
    goalsOrganize: string
    empty: (month: string) => string
    open: string
    biggestCategory: (name: string, amount: string) => string
    unusualCount: (n: number) => string
    count: (n: number) => string
  }
  /** "A receber": money paid on someone else's behalf, until it's paid back (src/data/receivables.ts). */
  receivables: {
    title: string
    sub: string
    total: string
    people: (n: number) => string
    emptyTitle: string
    emptyText: string
    settled: string
    settledCount: (n: number) => string
    left: (amount: string) => string
    leftOf: (left: string, total: string) => string
    paidBack: string
    received: (amount: string) => string
    progress: (person: string) => string
    unknownTransaction: string
    card: { title: string; total: string; more: (n: number) => string }
    sheet: {
      section: string
      add: string
      addNote: string
      addMore: string
      repay: string
      repayNote: string
      repaidBy: (person: string) => string
    }
    form: {
      newTitle: string
      editTitle: string
      person: string
      personPlaceholder: string
      personRequired: string
      amount: string
      amountHint: (max: string) => string
      amountInvalid: (max: string) => string
      amountBelowReceived: (min: string) => string
      all: string
      half: string
      save: string
      failed: string
    }
    detail: {
      receivedLabel: string
      leftLabel: string
      payments: string
      noPayments: string
      fromTransaction: (description: string) => string
      byHand: string
      deletePayment: string
      addPayment: string
      receivedAll: string
      edit: string
      delete: string
      confirmDelete: string
      deleteYes: string
    }
    payment: {
      title: string
      who: string
      whoSub: (amount: string) => string
      none: string
      cameIn: string
      byHandOption: string
      byHandNote: string
      noCandidates: string
      amount: string
      amountHint: (max: string) => string
      amountInvalid: (max: string) => string
      date: string
      save: string
    }
  }
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
    receivableNotExpense: string
    receivableNotMoneyIn: string
    receivableOverExpense: string
    receivableOverOwed: string
    receivableOverReceived: string
    receivableBelowReceived: string
    receivableOtherTransaction: string
    http: (status: number) => string
  }
  /** "13º e férias": a CLT job's extra pay, off by default (src/data/extraPay.ts). */
  extraPay: {
    title: string
    sub: string
    switchLabel: string
    switchNote: string
    offText: string
    nextTitle: string
    nextSub: string
    nextNone: string
    total: (amount: string) => string
    thirteenth: (part: 1 | 2) => string
    thirteenthMeta: (part: 1 | 2) => string
    vacation: (from: string, to: string) => string
    vacationMeta: (days: number, sold: boolean) => string
    salaryCut: (month: string) => string
    salaryCutMeta: (days: number) => string
    vacationsTitle: string
    vacationsNone: string
    vacationRange: (from: string, to: string) => string
    vacationDays: (days: number, sold: boolean) => string
    vacationPast: string
    add: string
    edit: (range: string) => string
    howTitle: string
    salaryLabel: string
    salaryDetected: (amount: string) => string
    salarySet: (amount: string) => string
    salaryMissing: string
    firstPartLabel: string
    firstPartValue: (month: string | null) => string
    note: string
    salarySheet: { title: string; sub: string; field: string; hint: (detected: string | null) => string; invalid: string; useDetected: string; save: string; cancel: string }
    firstPartSheet: { title: string; sub: string; withVacation: string; withVacationNote: string; byDay: (month: string) => string; apply: string }
    vacationSheet: {
      addTitle: string
      editTitle: string
      start: string
      startHint: string
      days: string
      daysNote: (back: string) => string
      fewer: string
      more: string
      sold: string
      soldNote: string
      preview: (date: string, amount: string) => string
      save: string
      cancel: string
      remove: string
      removeConfirm: string
      invalidDate: string
    }
    failed: string
    card: { title: string; next: (what: string, date: string) => string; none: string; cut: (month: string, amount: string) => string; open: string; noSalary: string }
  }
  spendingBalance: {
    title: string
    groups: { essential: string; lifestyle: string; future: string; ungrouped: string }
    /** Short names for the two-option pickers. */
    short: { essential: string; lifestyle: string }
    status: { onTarget: string; attention: string; overIncome: string; partial: string; incomplete: string; noIncome: string }
    open: (status: string) => string
    sub: (month: string, income: string) => string
    subSoFar: (month: string, income: string) => string
    subNoIncome: (month: string, soFar: boolean) => string
    onTarget: string
    above: (group: string, points: number) => string
    below: (group: string, points: number) => string
    overIncome: (amount: string) => string
    partialEarly: string
    partialLate: string
    incomplete: (amount: string) => string
    noIncome: string
    includesUngrouped: (amount: string) => string
    includesExpected: (amount: string) => string
    includesReserve: (amount: string) => string
    classifyAmount: (amount: string) => string
    target: (pct: number) => string
    barAria: (e: number, l: number, f: number, te: number, tl: number, tf: number) => string
    emptyText: string
    organize: string
    emptyNote: string
    detail: {
      subtitle: string
      closedMonth: string
      soFar: (day: number, of: number) => string
      legendTarget: (e: number, l: number, f: number) => string
      editTarget: string
      legendIncome: string
      legendOver: string
      base: (income: string) => string
      baseExpected: (income: string) => string
      expectedNote: (received: string) => string
      baseAll: string
      baseNote: (included: string, excluded: string | null) => string
      change: string
      rowShare: (pct: string, target: number) => string
      span: (from: string, to: string) => string
      points: (n: number) => string
      soFarTag: string
      withExpectedTag: string
      legendReserve: string
      rowReserved: (amount: string) => string
      reserveNote: (parts: string) => string
      reservePart: (group: string, amount: string) => string
      expectedSpendNote: (amount: string) => string
      itemExpected: (amount: string) => string
      insideFuture: (amount: string) => string
      classify: string
      overTarget: (amount: string) => string
      overTargetOf: (target: string) => string
      underTarget: (amount: string, target: string) => string
      atTarget: (target: string) => string
      topShare: (names: string, pct: number) => string
      shareOfGroup: (pct: number) => string
      fromCategory: (name: string) => string
      more: (n: number) => string
      less: string
      ungroupedNote: string
      uncategorized: string
      txCount: (n: number) => string
      noGroupYet: string
      emptyGroup: string
      trendTitle: string
      rangeLabel: string
      months6: string
      year: string
      incomeLine: string
      trendSummary: (lo: number, hi: number) => string
      trendOver: (month: string, amount: string) => string
      trendAria: (from: string, to: string) => string
      trendEmpty: string
      showTable: string
      hideTable: string
      table: { month: string; income: string }
      noIncomeBanner: string
      organize: string
    }
    org: {
      title: string
      introTitle: string
      introText: string
      help: { essential: string; lifestyle: string; future: string }
      suggested: (n: number, total: number) => [string, string, string]
      seeSuggestions: string
      oneByOne: string
      reviewTitle: string
      reviewSub: (n: number) => string
      choose: string
      chosen: string
      noSuggestion: (n: number) => string
      suggestedAs: (group: string) => string
      perMonth: (amount: string) => string
      left: (n: number) => string
      allSet: (n: number) => string
      save: string
      saving: string
      saved: string
      savedN: (n: number) => string
      undo: string
      failed: string
      empty: string
      back: string
    }
    targetSheet: {
      title: string
      sub: string
      presetNotes: [string, string, string]
      custom: string
      customNote: string
      futureNote: string
      decrease: (name: string) => string
      increase: (name: string) => string
      help: string
      atLimit: string
      dividers: [string, string]
      aria: (e: number, l: number, f: number) => string
      save: string
      cancel: string
      failed: string
    }
    cats: {
      targetRow: string
      edit: string
      field: string
      fieldHelp: string
      none: string
      followsCategory: string
      subNote: string
      otherGroup: (n: number) => string
      pick: string
      pickTitle: (name: string) => string
      pickSub: string
      subTitle: (name: string) => string
      subSub: (category: string) => string
      same: (category: string) => string
      sameNote: (group: string | null) => string
      always: (group: string) => string
      subInfo: (name: string, month: string, amount: string) => string
      save: string
      cancel: string
    }
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
    syncing: (bank: string | null) => string
    /** Under it: "1 de 2 bancos", then the chosen period. */
    syncingDetail: (n: number, total: number) => string
    wait: string
    syncedNow: string
    failed: (banks: string, _count: number) => string
    othersOk: string
    retryShort: string
    doneTitle: string
    newCount: (n: number) => string
    accountsCount: (n: number) => string
    tip: { title: string; body: string; ok: string }
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
    /** Advanced sync: which accounts, and how far back. */
    advanced: {
      open: string
      title: string
      period: string
      periods: Record<SyncPeriod, string>
      defaultNote: string
      since: (month: string, year: string) => string
      allNote: string
      longNote: string
      accounts: string
      allAccounts: string
      skippedNote: string
      noneSelected: string
      selectedCount: (n: number, total: number) => string
      cancel: string
      start: string
    }
  }
  /** Month-end projection, unusual categories and recurring charges. */
  insights: {
    back: string
    projection: {
      title: string
      titleUntil: (month: string) => string
      horizon: { label: string; month: string; nextMonth: string }
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
        receitas: (days: number[], freelance: boolean) => string
        receitasNone: string
        faturas: (cards: string, installments: string) => string
        faturasNone: (end: string) => string
        recorrentes: (names: string) => string
        recorrentesNone: (end: string) => string
        diaADia: (perDay: string) => string
        diaADiaOff: string
      }
      nextTitle: string
      nextNone: (end: string) => string
      event: {
        bill: (bank: string) => string
        billMeta: string
        billEstimated: string
        billMetaInstallments: (amount: string) => string
        recurringMeta: (method: string) => string
        salary: string
        freelance: string
        estimated: string
        thirteenth: (part: 1 | 2) => string
        thirteenthMeta: string
        vacation: string
        vacationMeta: (days: number, sold: boolean) => string
      }
      methods: { card: string; debit: string; pix: string; boleto: string }
      settingsTitle: string
      /** The row that opens "13º e férias", with its state. */
      extraPayLabel: string
      extraPayNote: (on: boolean) => string
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
  debug: {
    title: 'Depuração do Pluggy',
    link: 'Depuração do Pluggy',
    intro: 'A resposta do Pluggy para cada chamada, como o servidor recebe. Só quem está logado vê esta página. Temporária.',
    loading: 'Carregando…',
    notConfigured: 'O Pluggy não está configurado no servidor (PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_IDS).',
    failed: (status) => `A requisição falhou (HTTP ${status}).`,
    item: (n) => `Item ${n}`,
    accountsHint: 'Carregue as contas para ver cada conta.',
    itemCall: 'Item',
    accountsCall: 'Contas',
    page: (n) => `Página ${n}`,
    transactions: 'Transações',
    bills: 'Faturas',
    nextPage: 'Próxima página',
    copy: 'Copiar JSON',
    copied: 'Copiado',
    status: (status) => `HTTP ${status}`,
    identityCall: 'Identidade',
    investmentsCall: 'Investimentos',
    loansCall: 'Empréstimos',
    investmentTransactions: 'Movimentações',
    transactionsV1: 'Transações (endpoint antigo)',
    loadAll: 'Carregar tudo',
    loadAllBanks: 'Carregar tudo de todos os bancos',
    loadingAll: (done) => `Carregando… ${done} ${done === 1 ? 'chamada' : 'chamadas'}`,
    allTitle: 'Tudo o que o Meu Pluggy retorna',
    allNote:
      'Item, contas, todas as páginas de transações de cada conta e cartão (desde 2000, todo o histórico), faturas dos cartões e as transações deles também pelo endpoint antigo, identidade, investimentos e suas movimentações, e empréstimos. Um produto que o banco não compartilha aparece com o erro do Pluggy.',
    download: 'Baixar JSON',
  },
  fgts: {
    section: 'FGTS',
    outOfTotal: 'Fora do total',
    trackLabel: 'Acompanhar FGTS',
    trackNote: 'Saldo informado à mão, pelo app do FGTS. Fica fora do total.',
    keptNote: (count) => `Seu histórico de ${count === 1 ? '1 saldo' : `${count} saldos`} continua salvo.`,
    balanceOn: (date) => `Saldo em ${date}`,
    due: 'Atualize o saldo deste mês',
    emptyTitle: 'Nenhum saldo informado ainda.',
    emptyNote: 'Abra o app do FGTS, veja o saldo total e informe aqui.',
    explain: 'Só pode ser sacado em casos previstos (como compra de imóvel), por isso fica fora do total.',
    update: 'Atualizar saldo',
    history: 'Histórico',
    sheet: {
      title: 'Atualizar saldo do FGTS',
      editTitle: 'Corrigir saldo do FGTS',
      subtitle: 'Saldo total, como no app do FGTS',
      balanceLabel: 'Saldo total',
      balanceHint: 'O total de todas as contas, como aparece no app do FGTS.',
    },
    list: {
      title: 'Histórico do FGTS',
      subtitle: 'Fora do patrimônio líquido',
      emptyTitle: 'Nenhum saldo no histórico',
      emptyNote: 'Cada vez que você atualizar o saldo, ele aparece aqui.',
      clear: 'Apagar histórico',
      clearConfirm: 'Apagar todos os saldos do FGTS? Não dá para desfazer.',
      clearYes: 'Apagar tudo',
      close: 'Fechar',
    },
    reminder: {
      title: 'Hora de atualizar o saldo do FGTS',
      last: (date) => `Última atualização em ${date}${date.endsWith('.') ? '' : '.'}`,
      first: 'Informe o saldo atual para começar o histórico.',
      action: 'Atualizar saldo',
      later: 'Agora não',
    },
  },
  balance: {
    correcting: (date) => `Você está corrigindo o saldo de ${date}.`,
    balanceInvalid: 'Informe um valor, como 10.850,32.',
    dateLabel: 'Data do saldo',
    today: (date) => `Hoje, ${date}`,
    dateHint: 'Use a data que aparece junto do saldo no app.',
    dateFuture: 'A data não pode ser depois de hoje.',
    save: 'Salvar',
    saveCorrection: 'Salvar correção',
    saving: 'Salvando…',
    cancel: 'Cancelar',
    failed: 'Não foi possível salvar o saldo. Confira a conexão e tente de novo.',
    delete: 'Excluir este saldo',
    deleteConfirm: (date) => `Excluir o saldo de ${date}? A variação do mês seguinte é recalculada. Não dá para desfazer.`,
    deleteYes: 'Excluir',
    chartTitle: 'Saldo ao longo do tempo',
    chartSince: (change, month) => `${change} desde ${month}`,
    chartCount: (count) => (count === 1 ? '1 saldo' : `${count} saldos`),
    listLabel: 'Saldos informados · toque para corrigir',
    latest: 'Mais recente',
    withdrawal: 'saque',
    first: 'Primeiro saldo',
    edit: (date) => `Corrigir o saldo de ${date}`,
    outOfTotal: 'Fora do total',
  },
  pension: {
    section: 'Previdência privada',
    trackLabel: 'Acompanhar previdência privada',
    trackNote: 'Saldos informados à mão, plano a plano. Fica fora do total.',
    keptNote: (count) => (count === 1 ? 'Seu plano continua salvo.' : `Seus ${count} planos continuam salvos.`),
    plans: (count) => (count === 1 ? '1 plano' : `${count} planos`),
    dueCount: (count) => (count === 1 ? '1 plano precisa de atualização' : `${count} planos precisam de atualização`),
    add: 'Adicionar plano',
    emptyTitle: 'Nenhum plano ainda.',
    emptyNote: 'Adicione cada plano com o nome que quiser.',
    balanceOn: (date) => `Saldo em ${date}`,
    changeSince: (date) => `desde ${date}`,
    badgeUpdate: 'Atualizar saldo',
    badgeNew: 'Sem saldo ainda',
    open: (name) => `Abrir ${name}`,
    plan: {
      addTitle: 'Adicionar plano',
      editTitle: 'Editar plano',
      subtitle: 'Previdência privada · fora do total',
      nameLabel: 'Nome do plano',
      namePlaceholder: 'Ex.: Previdência Banco Exemplo',
      nameHint: 'Use o nome que você reconhece.',
      nameEmpty: 'Dê um nome ao plano.',
      typeLabel: 'Tipo',
      optional: 'opcional',
      typeNone: 'Não informado',
      typeHint: 'PGBL é dedutível na declaração completa do IR. VGBL paga imposto só sobre os rendimentos.',
      firstBalance: 'Primeiro saldo',
      balanceLabel: 'Saldo',
      firstHint: 'Como aparece no extrato ou no app do plano. Dá para informar depois.',
      keepHistory: (count) => `O histórico de ${count === 1 ? '1 saldo' : `${count} saldos`} continua igual ao editar o nome ou o tipo.`,
      add: 'Adicionar',
      save: 'Salvar',
      delete: 'Excluir plano',
      deleteConfirm: (name) => `Excluir ${name} e todo o histórico de saldos? Não dá para desfazer.`,
      deleteYes: 'Excluir plano',
      failed: 'Não foi possível salvar o plano. Confira a conexão e tente de novo.',
    },
    detail: {
      subtitle: 'Fora do patrimônio líquido',
      edit: 'Editar plano',
      emptyTitle: 'Nenhum saldo informado ainda.',
      emptyNote: 'Informe o saldo de hoje para começar o histórico deste plano.',
      inform: 'Informar saldo',
      update: 'Atualizar saldo',
    },
    update: {
      title: 'Atualizar saldo',
      editTitle: 'Corrigir saldo',
      balanceLabel: 'Saldo',
      balanceHint: 'O saldo do plano, como aparece no extrato ou no app.',
    },
    reminder: {
      title: 'Hora de atualizar sua previdência',
      oneLate: (name) => `${name} está há mais de 1 mês sem atualização.`,
      oneNew: (name) => `${name} ainda não tem saldo.`,
      many: (count) => `${count} planos estão há mais de 1 mês sem atualização ou sem saldo.`,
      chooseTitle: 'Qual plano atualizar?',
      chooseNote: 'Estes planos estão há mais de 1 mês sem atualização ou ainda não têm saldo.',
      lastOn: (date) => `Último saldo em ${date}`,
      none: 'Sem saldo ainda',
    },
  },
  balancesReminder: {
    title: 'Hora de atualizar seus saldos',
    balanceOf: (date) => `Saldo de ${date}`,
    planNew: 'Sem saldo ainda',
    plansLate: (count) => `${count} planos sem atualização há mais de 1 mês`,
    plansLabel: 'Previdência privada',
    update: 'Atualizar',
  },
  outOfTotal: {
    title: 'Fora do total',
    manual: 'Informados à mão',
    whyLabel: 'Por que fica fora do total',
    whyBoth: 'O total é dinheiro nas contas menos faturas. FGTS e previdência não entram.',
    whyFgts: 'O total é dinheiro nas contas menos faturas. O FGTS não entra.',
    whyPension: 'O total é dinheiro nas contas menos faturas. A previdência não entra.',
  },
  privacy: {
    hide: 'Ocultar valores',
    show: 'Mostrar valores',
    on: 'Valores ocultos',
    showShort: 'Mostrar',
    turnedOn: 'Valores ocultos',
    staysOn: 'Continua assim até você mostrar de novo',
    chartHidden: 'Gráfico oculto',
    comparisonsHidden: 'Com os valores ocultos, as comparações por categoria também ficam escondidas.',
  },
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
    netWorth: 'Patrimônio líquido · hoje',
    accountsLink: 'Contas',
    inAccounts: 'Dinheiro nas contas',
    cardBills: 'Faturas em aberto',
    bankStale: (bank, date) => `${bank} não atualizou hoje. O valor usa o saldo de ${date} desse banco.`,
    negativeNote: 'As faturas em aberto passam do dinheiro nas contas.',
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
    trend: 'Tendência',
    span: (from, to) => `${from} a ${to}`,
    shortHistory: (month) => `Seus dados começam em ${month}. Os meses sem dados aparecem tracejados.`,
    kept: 'da receita do mês foi guardado',
    keptShort: 'Guardado no mês',
    comingUp: 'Próximos pagamentos',
    openCardBills: 'Faturas em aberto',
    due: (date) => `Vence ${date}`,
    installmentsNextMonth: 'Parcelas do próximo mês',
    nextMonthPurchases: (month, n) => `${month} · ${n} ${n === 1 ? 'compra' : 'compras'}`,
    spendingByCategory: 'Gastos por categoria',
    monthInDetail: 'Mês em detalhe',
    layout: {
      open: 'Personalizar',
      title: 'Personalizar visão geral',
      sub: 'Ordem e cartões visíveis. Vale em todos os aparelhos.',
      sections: {
        netWorth: 'Patrimônio líquido',
        monthClose: 'Fechamento do mês',
        balance: 'Equilíbrio do mês',
        projection: 'Previsão do fim do mês',
        unusual: 'Fora do padrão',
        recurring: 'Recorrentes',
        whereMoney: 'Onde está seu dinheiro',
        comingUp: 'Próximos pagamentos',
        incomeVsExpenses: 'Receitas vs. despesas',
        spendingByCategory: 'Gastos por categoria',
        averageIncome: 'Renda média',
        extraPay: '13º e férias',
        receivables: 'A receber',
        monthInDetail: 'Mês em detalhe',
      },
      moveUp: (name) => `Subir ${name}`,
      moveDown: (name) => `Descer ${name}`,
      show: (name) => `Mostrar ${name}`,
      hiddenTag: 'Oculto',
      extraPayOff: 'Aparece quando 13º e férias está ligado',
      receivablesNone: 'Aparece quando alguém te deve',
      monthCloseOff: 'Aparece nos 10 primeiros dias do mês',
      shownCount: (n, total) => `${n} de ${total} visíveis`,
      reset: 'Restaurar padrão',
      cancel: 'Cancelar',
      save: 'Salvar',
      failed: 'Não foi possível salvar. Tente de novo.',
      allHidden: 'Todos os cartões estão ocultos. Use Personalizar para mostrar algum.',
    },
    currentMonth: (day) => `Mês atual · até hoje, ${day}`,
    closedMonth: 'Mês fechado',
    fetchingMonth: (month) => `Buscando ${month}…`,
    fetchMonthFailed: (month) => `Não foi possível buscar ${month}.`,
    topCategories: 'Maiores categorias',
    monthPicker: {
      open: (month) => `Escolher mês, ${month}`,
      title: 'Escolher mês',
      subtitle: 'Meses salvos no Trove',
      current: 'Mês atual',
      count: (n) => (n === 1 ? '1 transação' : `${n} transações`),
      onServer: 'Salvo no servidor',
    },
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
    fetchingStored: 'Buscando transações salvas…',
    fetchStoredFailed: (month) => (month ? `Não foi possível buscar as transações de ${month}.` : 'Não foi possível buscar as transações salvas.'),
    retrying: 'Tentando…',
    storedPending: (month) =>
      `As transações ${month ? `de ${month}` : 'dos meses anteriores'} estão salvas no servidor e aparecem aqui quando a busca der certo.`,
    monthSheet: { title: 'Mês', subtitle: 'Escolha um mês ou veja todos', allNote: 'Mais recentes primeiro' },
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
    investmentRow: 'Investimento · aplicação ou resgate',
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
    markInvestment: 'Marcar como investimento',
    markInvestmentNote: 'Aplicação ou resgate: não conta como receita nem despesa, o dinheiro continua seu.',
    notInvestment: 'Não é investimento',
    investmentNote: 'Aplicações e resgates não contam como receita nem despesa: o dinheiro só mudou de lugar. Continua no saldo da conta.',
    removeCategory: 'Remover categoria',
    uncategorizedNote: 'Esta transação está sem categoria. Escolha uma acima quando quiser.',
    categoryRemoved: 'Categoria removida',
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
      title: 'Renomear',
      bankNameLabel: 'Nome no banco',
      label: 'Apelido',
      note: 'Aparece no lugar do nome do banco em todo o app.',
      emptyNote: 'Deixe em branco para usar o nome do banco.',
      clear: 'Limpar apelido',
      save: 'Salvar',
      saving: 'Salvando…',
      cancel: 'Cancelar',
      useBank: 'Usar o nome do banco',
      failed: 'Não foi possível salvar o apelido. Confira a conexão e tente de novo.',
      saved: 'Apelido salvo',
      restored: 'Nome do banco restaurado',
      undo: 'Desfazer',
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
      useEstimate: 'Usar a estimativa',
      useBills: 'Usar as datas das faturas',
      note: 'Salvo no Trove: vale em todos os aparelhos.',
      estimated: (close, due) => `Fecha por volta do dia ${close} · vence no dia ${due}`,
      fromBills: (close, due) => `Fecha no dia ${close} · vence no dia ${due}`,
      fromClosings: (bills) => (bills === 1 ? 'Pela data de fechamento da última fatura.' : `Pelas datas de fechamento das últimas ${bills} faturas.`),
      estimatedFrom: (bills) => (bills === 1 ? 'Estimado pela última fatura, já que o banco não informa a data de fechamento.' : `Estimado pelas últimas ${bills} faturas, já que o banco não informa a data de fechamento.`),
      adjust: 'Ajustar',
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
    mixedNote: 'A seleção tem receitas e despesas. Nesse caso só dá para remover a categoria.',
    uncategorize: 'Sem categoria',
    uncategorizeNote: 'Remove a categoria e a subcategoria',
    total: 'Total',
    current: 'Hoje estão em',
    resultLabel: 'Como vai ficar',
    clearResult: (n) => (n === 1 ? 'A 1 fica sem categoria' : `As ${n} ficam sem categoria`),
    pickCategory: 'Escolha a categoria',
    pickFirst: 'Escolha uma categoria primeiro.',
    optional: 'opcional',
    tapAgain: (name) => `Toque de novo em “${name}” para deixar sem subcategoria.`,
    noSubcategory: 'sem subcategoria',
    remove: (n) => `Remover de ${n}`,
    failed: 'Não foi possível atualizar as transações. Nada foi alterado.',
    cancel: 'Cancelar',
    apply: (n) => `Aplicar a ${n}`,
    saving: 'Salvando…',
    updated: (n) => (n === 1 ? '1 transação atualizada' : `${n} transações atualizadas`),
    undo: 'Desfazer',
    undone: 'Alteração desfeita',
    undoFailed: 'Não foi possível desfazer. Tente de novo.',
    panelNote: 'Shift + clique seleciona um intervalo. Transferências entre suas contas não podem ser selecionadas.',
  },
  monthClose: {
    title: (month) => `Fechamento de ${month}`,
    sub: 'O resumo do mês que terminou',
    cardTitle: (month) => `${month[0].toUpperCase()}${month.slice(1)} fechou`,
    kept: (amount) => `Você guardou ${amount}`,
    overspent: (amount) => `Você gastou ${amount} a mais do que entrou`,
    keptPct: (pct) => `${pct} da renda`,
    noIncome: 'Nenhuma renda entrou no mês',
    income: 'Entrou',
    expenses: 'Saiu',
    net: 'Sobrou',
    changedTitle: 'O que mudou',
    vsPrevious: (month) => `vs. ${month}`,
    vsAverageShort: 'vs. média',
    changedSub: (previous, months) =>
      [previous && `Comparado a ${previous}`, months && `média ${months === 1 ? 'do mês anterior' : `dos ${months} meses anteriores`}`].filter(Boolean).join(' e à '),
    noPrevious: 'Ainda não há um mês anterior para comparar.',
    movers: 'Categorias que mais mudaram',
    moverWas: (before) => `era ${before}`,
    biggestTitle: 'Maiores gastos',
    byCategory: 'Por categoria',
    share: (pct) => `${pct} dos gastos`,
    largest: 'Maiores compras',
    unusualTitle: 'Fora do padrão',
    unusualRow: (pct, above, avg) => `${pct} ${above ? 'acima' : 'abaixo'} da média · média ${avg}`,
    unusualNone: 'Todas as categorias ficaram dentro do normal.',
    unusualNoHistory: 'Ainda não há meses suficientes para comparar.',
    goalsTitle: 'Meta · Equilíbrio do mês',
    goalsTarget: (pct) => `meta ${pct}`,
    goalsOpen: 'Ver equilíbrio do mês',
    goalsNone: 'Coloque as categorias em Essencial ou Estilo de vida para acompanhar a meta de cada mês.',
    goalsOrganize: 'Organizar categorias',
    empty: (month) => `Nenhuma transação em ${month}.`,
    open: 'Ver fechamento',
    biggestCategory: (name, amount) => `Maior gasto: ${name}, ${amount}`,
    unusualCount: (n) => (n === 1 ? '1 categoria fora do padrão' : `${n} categorias fora do padrão`),
    count: (n) => (n === 1 ? '1 transação' : `${n} transações`),
  },
  receivables: {
    title: 'A receber',
    sub: 'Compras e Pix que você pagou por outras pessoas, até elas devolverem.',
    total: 'Total a receber',
    people: (n) => (n === 1 ? '1 pessoa' : `${n} pessoas`),
    emptyTitle: 'Ninguém te deve nada',
    emptyText: 'Abra uma compra ou um Pix que você pagou por alguém e toque em “Paguei por alguém”.',
    settled: 'Já devolvidos',
    settledCount: (n) => (n === 1 ? '1 devolvido' : `${n} devolvidos`),
    left: (amount) => `Faltam ${amount}`,
    leftOf: (left, total) => `Faltam ${left} de ${total}`,
    paidBack: 'Devolvido',
    received: (amount) => `${amount} devolvido`,
    progress: (person) => `Quanto ${person} já devolveu`,
    unknownTransaction: 'Transação fora dos meses carregados',
    card: { title: 'A receber', total: 'Te devem', more: (n) => (n === 1 ? '+1 pessoa' : `+${n} pessoas`) },
    sheet: {
      section: 'A receber',
      add: 'Paguei por alguém',
      addNote: 'Acompanhe até a pessoa te devolver. Os totais não mudam.',
      addMore: 'Mais alguém vai devolver',
      repay: 'É uma devolução',
      repayNote: 'Abate do que alguém te deve',
      repaidBy: (person) => `Devolução de ${person}`,
    },
    form: {
      newTitle: 'Paguei por alguém',
      editTitle: 'Editar valor a receber',
      person: 'Quem vai devolver',
      personPlaceholder: 'Nome',
      personRequired: 'Digite um nome.',
      amount: 'Valor',
      amountHint: (max) => `Até ${max}`,
      amountInvalid: (max) => `Digite um valor entre R$ 0,01 e ${max}.`,
      amountBelowReceived: (min) => `Já foram devolvidos ${min}: o valor não pode ser menor.`,
      all: 'Tudo',
      half: 'Metade',
      save: 'Salvar',
      failed: 'Não foi possível salvar. Tente de novo.',
    },
    detail: {
      receivedLabel: 'Devolvido',
      leftLabel: 'Falta',
      payments: 'Devoluções',
      noPayments: 'Nenhuma devolução ainda.',
      fromTransaction: (description) => `Entrada · ${description}`,
      byHand: 'Registrada à mão',
      deletePayment: 'Excluir devolução',
      addPayment: 'Registrar devolução',
      receivedAll: 'Recebi tudo',
      edit: 'Editar',
      delete: 'Excluir',
      confirmDelete: 'Excluir este valor a receber e as devoluções registradas? A transação continua igual.',
      deleteYes: 'Excluir',
    },
    payment: {
      title: 'Registrar devolução',
      who: 'De quem é esta devolução?',
      whoSub: (amount) => `Entrada de ${amount}`,
      none: 'Ninguém te deve nada agora. Marque antes a compra ou o Pix que você pagou por alguém.',
      cameIn: 'Como chegou',
      byHandOption: 'Outra forma',
      byHandNote: 'Dinheiro, outra conta ou algo fora do Trove',
      noCandidates: 'Nenhuma entrada recente livre. Registre de outra forma.',
      amount: 'Valor devolvido',
      amountHint: (max) => `Até ${max}`,
      amountInvalid: (max) => `Digite um valor entre R$ 0,01 e ${max}.`,
      date: 'Data',
      save: 'Registrar',
    },
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
    receivableNotExpense: 'Só uma saída de dinheiro pode ficar a receber.',
    receivableNotMoneyIn: 'Só uma entrada de dinheiro pode ser uma devolução.',
    receivableOverExpense: 'O valor a receber passa do valor da transação.',
    receivableOverOwed: 'A devolução passa do que falta receber.',
    receivableOverReceived: 'A devolução passa do valor que entrou.',
    receivableBelowReceived: 'O valor não pode ficar abaixo do que já foi devolvido.',
    receivableOtherTransaction: 'Este valor a receber é de outra transação.',
    http: (status) => `A requisição falhou (HTTP ${status}).`,
  },
  extraPay: {
    title: '13º e férias',
    sub: 'Para quem trabalha com carteira assinada (CLT)',
    switchLabel: 'Trabalho com carteira assinada (CLT)',
    switchNote: 'Ligado, a previsão do fim do mês conta o 13º, as férias e o salário menor no mês das férias. Desligado, nada muda.',
    offText: 'Sem carteira assinada (PJ, autônomo, freelance), deixe desligado: nada muda nas previsões.',
    nextTitle: 'Próximos 12 meses',
    nextSub: 'Estimativas a partir do salário líquido',
    nextNone: 'Nada previsto nos próximos 12 meses.',
    total: (amount) => `${amount} a mais no período`,
    thirteenth: (part) => `13º salário · ${part}ª parcela`,
    thirteenthMeta: (part) => (part === 1 ? 'Metade do salário, sem descontos' : 'O resto, com INSS e IR do 13º; costuma vir um pouco menor'),
    vacation: (from, to) => `Férias de ${from} a ${to}`,
    vacationMeta: (days, sold) => (sold ? `${days} dias + 10 vendidos, com 1/3 · 2 dias antes` : `${days} dias com 1/3 · 2 dias antes`),
    salaryCut: (month) => `Salário de ${month} menor`,
    salaryCutMeta: (days) => `${days} ${days === 1 ? 'dia de férias já pago' : 'dias de férias já pagos'} antes`,
    vacationsTitle: 'Férias planejadas',
    vacationsNone: 'Nenhuma férias marcada. Adicione as datas assim que forem combinadas.',
    vacationRange: (from, to) => `${from} a ${to}`,
    vacationDays: (days, sold) => (sold ? `${days} dias · 10 vendidos` : `${days} dias`),
    vacationPast: 'Já passou',
    add: 'Adicionar férias',
    edit: (range) => `Editar férias de ${range}`,
    howTitle: 'Como calcular',
    salaryLabel: 'Salário líquido por mês',
    salaryDetected: (amount) => `${amount} · média do Trove`,
    salarySet: (amount) => `${amount} · informado`,
    salaryMissing: 'Informe o salário: ainda não há histórico',
    firstPartLabel: '1ª parcela do 13º',
    firstPartValue: (month) => (month ? `Até o dia 30 de ${month}` : 'Junto com as férias'),
    note: 'O 13º vem em duas parcelas: a 1ª até 30 de novembro (ou antes) e a 2ª até 20 de dezembro. As férias são pagas 2 dias antes de começar, com 1/3 a mais, e o salário do mês vem menor pelos dias de férias. Dia sem expediente bancário antecipa o pagamento.',
    salarySheet: {
      title: 'Salário líquido por mês',
      sub: 'O que cai na conta num mês normal, sem 13º e férias.',
      field: 'Salário líquido',
      hint: (detected) => (detected ? `O Trove calcula ${detected} pelo histórico.` : 'Ainda não há histórico de salário.'),
      invalid: 'Informe um valor maior que zero.',
      useDetected: 'Usar a média do Trove',
      save: 'Salvar',
      cancel: 'Cancelar',
    },
    firstPartSheet: {
      title: '1ª parcela do 13º',
      sub: 'Quando a empresa costuma pagar.',
      withVacation: 'Junto com as férias',
      withVacationNote: 'Se houver férias de janeiro a novembro; senão, em novembro',
      byDay: (month) => `Até o dia 30 de ${month}`,
      apply: 'Aplicar',
    },
    vacationSheet: {
      addTitle: 'Adicionar férias',
      editTitle: 'Editar férias',
      start: 'Primeiro dia de férias',
      startHint: 'O pagamento vem 2 dias antes.',
      days: 'Dias de férias',
      daysNote: (back) => `Volta ao trabalho em ${back}`,
      fewer: 'Menos um dia',
      more: 'Mais um dia',
      sold: 'Vender 10 dias (abono)',
      soldNote: 'Recebe 10 dias a mais com 1/3; até 20 dias de descanso.',
      preview: (date, amount) => `Pagamento em ${date} · cerca de ${amount}`,
      save: 'Salvar',
      cancel: 'Cancelar',
      remove: 'Excluir',
      removeConfirm: 'Excluir estas férias?',
      invalidDate: 'Informe uma data válida.',
    },
    failed: 'Não foi possível salvar. Tente de novo.',
    card: {
      title: '13º e férias',
      next: (what, date) => `${what} · ${date}`,
      none: 'Nada previsto nos próximos 12 meses.',
      cut: (month, amount) => `Salário de ${month} menor em ${amount}`,
      open: 'Ver detalhes',
      noSalary: 'Informe o salário líquido para estimar os valores.',
    },
  },
  spendingBalance: {
    title: 'Equilíbrio do mês',
    groups: { essential: 'Essencial', lifestyle: 'Estilo de vida', future: 'Futuro', ungrouped: 'Sem grupo' },
    short: { essential: 'Essencial', lifestyle: 'Estilo' },
    status: { onTarget: 'Dentro da meta', attention: 'Atenção', overIncome: 'Acima da renda', partial: 'Em andamento', incomplete: 'Incompleto', noIncome: 'Sem renda' },
    open: (status) => `Equilíbrio do mês: ${status}. Abrir detalhes`,
    sub: (month, income) => `${month} · sobre ${income} de renda`,
    subSoFar: (month, income) => `${month} até agora · sobre ${income} de renda prevista`,
    subNoIncome: (month, soFar) => (soFar ? `${month} até agora · nenhuma renda ainda` : `${month} · nenhuma renda`),
    onTarget: 'Os três grupos estão perto da meta.',
    above: (group, points) => `${group} está ${points} ${points === 1 ? 'ponto' : 'pontos'} acima da meta.`,
    below: (group, points) => `${group} está ${points} ${points === 1 ? 'ponto' : 'pontos'} abaixo da meta.`,
    overIncome: (amount) => `Os gastos passaram a renda em ${amount}.`,
    partialEarly: 'O mês está no começo: o Futuro costuma diminuir até o fim.',
    partialLate: 'O mês ainda não acabou: os números mudam até o fim.',
    incomplete: (amount) => `${amount} ainda sem grupo. Classifique para ver o equilíbrio real.`,
    noIncome: 'Nenhuma renda entrou ainda, então mostramos só os valores.',
    includesUngrouped: (amount) => `Inclui ${amount} sem grupo`,
    includesExpected: (amount) => `Inclui ${amount} previstos: parcelas e recorrentes do mês`,
    includesReserve: (amount) => `${amount} reservados até a meta de cada grupo, fora do Futuro`,
    classifyAmount: (amount) => `Classificar ${amount}`,
    target: (pct) => `meta ${pct}%`,
    barAria: (e, l, f, te, tl, tf) => `Essencial ${e}%, Estilo de vida ${l}%, Futuro ${f}% da renda. Meta ${te}, ${tl} e ${tf}.`,
    emptyText: 'Separe seus gastos em Essencial e Estilo de vida e veja, mês a mês, quanto da renda sobra para o Futuro.',
    organize: 'Organizar categorias',
    emptyNote: 'Sugerimos um grupo para cada categoria. Você revisa antes de salvar.',
    detail: {
      subtitle: 'Como a renda se divide entre os grupos',
      closedMonth: 'Mês fechado',
      soFar: (day, of) => `Até agora · ${day} de ${of} dias`,
      legendTarget: (e, l, f) => `Meta ${e} · ${l} · ${f}`,
      editTarget: 'Editar meta',
      legendIncome: 'Renda',
      legendOver: 'Acima da renda',
      base: (income) => `Sobre ${income} de renda`,
      baseExpected: (income) => `Sobre ${income} de renda prevista`,
      expectedNote: (received) => `Sua renda média (últimos 6 meses); já entraram ${received}.`,
      baseAll: 'Toda a renda do mês.',
      baseNote: (included, excluded) => (excluded ? `${included}. ${excluded} ficam fora.` : `${included}.`),
      change: 'Alterar',
      rowShare: (pct, target) => `${pct} da renda · meta ${target}%`,
      span: (from, to) => `${from} a ${to}`,
      points: (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} ${Math.abs(n) === 1 ? 'ponto' : 'pontos'}`,
      soFarTag: 'até agora',
      withExpectedTag: 'com o previsto',
      legendReserve: 'Reservado até a meta',
      rowReserved: (amount) => `+ ${amount} reservado`,
      reserveNote: (parts) => `Até o fim do mês, o que falta para cada grupo chegar à meta fica reservado (${parts}). O Futuro é o que sobra além disso.`,
      reservePart: (group, amount) => `${amount} no ${group}`,
      expectedSpendNote: (amount) => `Os gastos incluem ${amount} previstos até o fim do mês: parcelas e recorrentes que ainda vão cair.`,
      itemExpected: (amount) => `inclui ${amount} previsto`,
      insideFuture: (amount) => `${amount} · dentro do Futuro`,
      classify: 'Classificar',
      overTarget: (amount) => `${amount} acima da meta`,
      overTargetOf: (target) => ` de ${target}.`,
      underTarget: (amount, target) => `${amount} abaixo da meta de ${target}.`,
      atTarget: (target) => `Na meta de ${target}.`,
      topShare: (names, pct) => ` ${names} somam ${pct}% do grupo.`,
      shareOfGroup: (pct) => `${pct}% do grupo`,
      fromCategory: (name) => `de ${name}`,
      more: (n) => `Mais ${n} ${n === 1 ? 'categoria' : 'categorias'}`,
      less: 'Mostrar menos',
      ungroupedNote: 'Enquanto não têm grupo, esses gastos ficam dentro do Futuro e o deixam maior do que é.',
      uncategorized: 'Sem categoria',
      txCount: (n) => `${n} ${n === 1 ? 'transação' : 'transações'}`,
      noGroupYet: 'Categoria ainda sem grupo',
      emptyGroup: 'Nenhum gasto neste grupo no mês.',
      trendTitle: 'Ao longo dos meses',
      rangeLabel: 'Período do gráfico',
      months6: '6 meses',
      year: '1 ano',
      incomeLine: 'renda',
      trendSummary: (lo, hi) => (lo === hi ? `O Essencial ficou em ${lo}% da renda.` : `O Essencial ficou entre ${lo}% e ${hi}% da renda.`),
      trendOver: (month, amount) => ` Em ${month}, os gastos passaram a renda em ${amount}.`,
      trendAria: (from, to) => `Divisão da renda por mês, de ${from} a ${to}.`,
      trendEmpty: 'Ainda não há meses fechados com renda para comparar.',
      showTable: 'Ver em tabela',
      hideTable: 'Ocultar tabela',
      table: { month: 'Mês', income: 'Renda' },
      noIncomeBanner: 'Sem renda no mês, os percentuais e a meta ficam de fora. Eles voltam quando a renda entrar.',
      organize: 'Organizar categorias',
    },
    org: {
      title: 'Organizar categorias',
      introTitle: 'Separe seus gastos em grupos',
      introText: 'Assim dá para ver, mês a mês, quanto da renda vai para o essencial, para o estilo de vida e para o futuro.',
      help: {
        essential: 'Moradia, contas da casa, mercado, saúde, transporte para o trabalho, escola.',
        lifestyle: 'Restaurantes, delivery, compras, viagens, assinaturas, hobbies.',
        future: 'O que sobra da renda depois dos outros dois. Não precisa escolher nada.',
      },
      suggested: (n, total) => ['Já sugerimos um grupo para ', `${n} das suas ${total} ${total === 1 ? 'categoria' : 'categorias'}`, ' pelo nome. Você confere tudo numa lista só antes de salvar.'],
      seeSuggestions: 'Ver sugestões',
      oneByOne: 'Prefiro escolher uma por uma',
      reviewTitle: 'Revisar grupos',
      reviewSub: (n) => `${n} ${n === 1 ? 'categoria' : 'categorias'} de despesa. Toque para trocar o grupo.`,
      choose: 'Escolha um grupo',
      chosen: 'Escolhidas por você',
      noSuggestion: (n) => `${n} sem sugestão`,
      suggestedAs: (group) => `Sugeridas como ${group}`,
      perMonth: (amount) => `${amount}/mês`,
      left: (n) => (n === 1 ? 'A 1 sem grupo fica em “Sem grupo” se você salvar agora.' : `As ${n} sem grupo ficam em “Sem grupo” se você salvar agora.`),
      allSet: (n) => (n === 1 ? 'A categoria tem grupo.' : `Todas as ${n} categorias têm grupo.`),
      save: 'Salvar grupos',
      saving: 'Salvando…',
      saved: 'Grupos salvos',
      savedN: (n) => `${n} ${n === 1 ? 'categoria organizada' : 'categorias organizadas'}`,
      undo: 'Desfazer',
      failed: 'Não foi possível salvar os grupos. Tente de novo.',
      empty: 'Nenhuma categoria de despesa ainda. Crie uma na aba Categorias.',
      back: 'Equilíbrio do mês',
    },
    targetSheet: {
      title: 'Meta do equilíbrio',
      sub: 'Quanto da renda vai para cada grupo',
      presetNotes: ['A mais conhecida', 'Mais espaço para o essencial', 'Para quando o custo fixo é alto'],
      custom: 'Personalizada',
      customNote: 'Você define os números',
      futureNote: 'Fica com o que sobra',
      decrease: (name) => `Diminuir ${name}`,
      increase: (name) => `Aumentar ${name}`,
      help: 'Arraste as divisões na barra ou use − e +. Passos de 5 pontos; toque e segure para ir de 1 em 1. A soma fica sempre em 100%.',
      atLimit: 'O Futuro chegou a 0%. Para aumentar um grupo, diminua o outro.',
      dividers: ['Divisão entre Essencial e Estilo de vida', 'Divisão entre Estilo de vida e Futuro'],
      aria: (e, l, f) => `Meta: Essencial ${e}%, Estilo de vida ${l}%, Futuro ${f}%`,
      save: 'Salvar meta',
      cancel: 'Cancelar',
      failed: 'Não foi possível salvar a meta. Tente de novo.',
    },
    cats: {
      targetRow: 'Meta do equilíbrio',
      edit: 'Editar',
      field: 'Grupo no equilíbrio',
      fieldHelp: 'Os gastos desta categoria entram nesse grupo.',
      none: 'Sem grupo',
      followsCategory: 'Segue a categoria',
      subNote: 'Uma subcategoria pode ir para outro grupo. Ex.: Apps de corrida em Estilo de vida.',
      otherGroup: (n) => `${n} em outro grupo`,
      pick: 'Escolher',
      pickTitle: (name) => `Grupo de ${name}`,
      pickSub: 'Os gastos desta categoria entram nesse grupo.',
      subTitle: (name) => `Grupo de ${name}`,
      subSub: (category) => `Subcategoria de ${category}`,
      same: (category) => `Igual a ${category}`,
      sameNote: (group) => (group ? `Hoje, ${group}. Muda junto se a categoria mudar.` : 'Hoje, sem grupo. Muda junto se a categoria mudar.'),
      always: (group) => `Sempre ${group}`,
      subInfo: (name, month, amount) => `Só os gastos marcados como ${name} mudam de grupo. Em ${month} foram ${amount}.`,
      save: 'Salvar',
      cancel: 'Cancelar',
    },
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
    syncing: (bank) => `Sincronizando ${bank ?? 'seu banco'}…`,
    syncingDetail: (n, total) => `${n} de ${total} ${total === 1 ? 'banco' : 'bancos'}`,
    wait: 'Aguarde',
    syncedNow: 'Sincronizado agora',
    failed: (banks, count) => `${banks} não ${count === 1 ? 'sincronizou' : 'sincronizaram'}.`,
    othersOk: 'Os outros estão em dia.',
    retryShort: 'Tentar',
    doneTitle: 'Sincronização concluída',
    newCount: (n) => (n === 1 ? '1 transação nova' : `${n} transações novas`),
    accountsCount: (n) => (n === 1 ? '1 conta' : `${n} contas`),
    tip: { title: 'Sincronização avançada', body: 'Escolha o período e as contas.', ok: 'Entendi' },
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
    advanced: {
      open: 'Sincronização avançada',
      title: 'Sincronização avançada',
      period: 'Período',
      periods: { default: 'Padrão', '3m': '3 meses', '6m': '6 meses', '1y': '1 ano', all: 'Tudo' },
      defaultNote: 'O que mudou desde a última sincronização',
      since: (month, year) => `Desde ${month} de ${year}`,
      allNote: 'Todo o histórico que o banco oferece',
      longNote: 'Períodos longos podem levar alguns minutos.',
      accounts: 'Contas e cartões',
      allAccounts: 'Todas as contas',
      skippedNote: 'As desmarcadas não são lidas agora: mantêm o que já está salvo, e só o saldo é atualizado.',
      noneSelected: 'Escolha ao menos uma conta.',
      selectedCount: (n, total) => `${n} de ${total} ${n === 1 ? 'selecionada' : 'selecionadas'}`,
      cancel: 'Cancelar',
      start: 'Sincronizar',
    },
  },
  insights: {
    back: 'Visão geral',
    projection: {
      title: 'Previsão do fim do mês',
      titleUntil: (month) => `Previsão até o fim de ${month}`,
      horizon: { label: 'Até quando prever', month: 'Este mês', nextMonth: 'Próximo mês' },
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
        receitas: (days, freelance) =>
          `${freelance ? 'Salário e freelance' : 'Salário'}, média de 6 meses${
            days.length === 0 ? '' : days.length === 1 ? ` · cai por volta do dia ${days[0]}` : ` · cai por volta dos dias ${days.slice(0, -1).join(', ')} e ${days.at(-1)}`
          }`,
        receitasNone: 'O salário deste mês já entrou',
        faturas: (cards, installments) => `${cards} · já incluem ${installments} em parcelas`,
        faturasNone: (end) => `Nenhuma fatura vence até ${end}`,
        recorrentes: (names) => `${names} · as do cartão já estão nas faturas`,
        recorrentesNone: (end) => `Nenhuma até ${end} · as do cartão já estão nas faturas`,
        diaADia: (perDay) => `${perDay} por dia no débito e Pix, média de 3 meses`,
        diaADiaOff: 'Fora do cálculo',
      },
      nextTitle: 'Próximos lançamentos',
      nextNone: (end) => `Nada previsto até ${end}.`,
      event: {
        bill: (bank) => `Fatura ${bank}`,
        billMeta: 'Cartão de crédito',
        billEstimated: 'Cartão de crédito · fatura aberta, pela média das últimas',
        billMetaInstallments: (amount) => `Cartão de crédito · inclui ${amount} em parcelas`,
        recurringMeta: (method) => `Recorrente · ${method}`,
        salary: 'Salário',
        freelance: 'Freelance',
        thirteenth: (part) => `13º salário · ${part}ª parcela`,
        thirteenthMeta: 'Estimativa a partir do salário',
        vacation: 'Férias',
        vacationMeta: (days, sold) => `${days} dias + 1/3${sold ? ' · 10 dias vendidos' : ''} · estimativa`,
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
      extraPayLabel: '13º e férias',
      extraPayNote: (on) => (on ? 'Ligado · conta o 13º, as férias e o salário menor no mês delas' : 'Desligado · só para quem tem carteira assinada (CLT)'),
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
