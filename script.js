/**
 * Project Ascend - Mobile-First Web Prototype
 * Persona: Riya, 20, Monthly Income ₹8,000
 * STAGE 4: Level Up Screen, Limit Progression Ladder (₹4k → ₹6k → ₹8k), Celebration Modal, History
 */

// ----------------------------------------------------
// LEVEL CONFIGURATIONS
// ----------------------------------------------------
const LEVELS = {
  1: {
    levelNumber: 1,
    name: 'Explorer',
    limit: 4000,
    nextLevel: 2,
    nextLevelName: 'Builder',
    nextLimit: 6000,
    nextUnlockText: 'Level 2 Builder unlocks a ₹6,000 credit limit with greater financial freedom.'
  },
  2: {
    levelNumber: 2,
    name: 'Builder',
    limit: 6000,
    nextLevel: 3,
    nextLevelName: 'Achiever',
    nextLimit: 8000,
    nextUnlockText: 'Level 3 Achiever unlocks an ₹8,000 credit limit (matching your full ₹8,000 monthly income).'
  },
  3: {
    levelNumber: 3,
    name: 'Achiever',
    limit: 8000,
    nextLevel: null,
    nextLevelName: null,
    nextLimit: null,
    nextUnlockText: "You've built a strong repayment record. Next unlock: savings-backed purchase credit."
  }
};

// ----------------------------------------------------
// PURCHASE CATALOG OPTIONS
// ----------------------------------------------------
const PURCHASE_OPTIONS = [
  { id: 'headphones', item: 'Headphones', amount: 800, icon: '🎧', category: 'Study & Audio' },
  { id: 'textbooks', item: 'Textbooks', amount: 600, icon: '📚', category: 'College Prep' },
  { id: 'groceries', item: 'Groceries', amount: 1200, icon: '🛒', category: 'Monthly Needs' },
  { id: 'tablet_cover', item: 'Tablet cover', amount: 1500, icon: '📱', category: 'Gadget Care' }
];

// ----------------------------------------------------
// SHARED APPLICATION STATE
// ----------------------------------------------------
const DEFAULT_STATE = {
  // Level & Credit Ladder
  level: 1,                             // Level 1 "Explorer", Level 2 "Builder", Level 3 "Achiever"
  currentLimit: 4000,                   // Total credit line limit in INR (₹4,000 → ₹6,000 → ₹8,000)
  completedDueWeeksAtCurrentLevel: [],  // Array of dueWeek numbers that have qualified at current level (max 2)
  creditedDueWeeks: [],                 // Array of all dueWeek numbers that have ever earned a ladder count
  repaymentsCompletedAtCurrentLevel: 0, // Ladder count at current level (0, 1, or 2)
  levelUpHistory: [],                   // History of past level-up events with reasons
  pendingCelebration: null,             // Celebration modal payload when level-up triggers

  // Time & Session
  currentWeek: 1,                       // Current simulated week
  purchases: [],                        // Array of purchases with stored repayment plans
  savings: {                            // Shared savings goal
    item: 'New Smartphone',
    phonePrice: 12000,
    targetAmount: 3600,
    currentAmount: 0,                   // Starts at ₹0 saved
    weeklyAddition: 450,
    capAmount: 3600
  },

  // Persona mock metadata
  persona: {
    name: 'Riya',
    age: 20,
    monthlyIncome: 8000,
    upiId: 'riya@oksbi',
    college: 'Delhi University'
  },

  // Screen navigation & onboarding sub-step
  currentScreen: 'onboarding',           // 'onboarding' | 'home' | 'spend' | 'repay' | 'levelup'
  onboardingStep: 'consent'              // 'consent' | 'verifying' | 'verified'
};

const STORAGE_KEY = 'ascend_prototype_state_v7';

// Application State Instance (with localStorage persistence)
let appState = loadState();
let blockedNotice = null; // Transient UI notification for limit/spending issues

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed.completedDueWeeksAtCurrentLevel)) {
        parsed.completedDueWeeksAtCurrentLevel = [];
      }
      if (!Array.isArray(parsed.creditedDueWeeks)) {
        parsed.creditedDueWeeks = [];
      }
      parsed.repaymentsCompletedAtCurrentLevel = parsed.completedDueWeeksAtCurrentLevel.length;
      return parsed;
    }
  } catch (e) {
    console.warn('Could not read state from localStorage', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn('Could not save state to localStorage', e);
  }
}

// ----------------------------------------------------
// CURRENCY & COMPUTED METRICS UTILITIES
// ----------------------------------------------------
function formatINR(amount) {
  return '\u20B9' + Number(amount).toLocaleString('en-IN');
}

function getTotalLimit() {
  const currentLvl = LEVELS[appState.level] || LEVELS[1];
  return currentLvl.limit;
}

/**
 * Calculates current outstanding used credit by summing all UNPAID instalments.
 * Paying an instalment reduces amount used and immediately restores available limit.
 */
function getAmountUsed() {
  if (!appState.purchases || !Array.isArray(appState.purchases)) return 0;
  return appState.purchases.reduce((acc, p) => {
    const unpaid = (p.instalments || []).filter(inst => inst.status !== 'paid');
    return acc + unpaid.reduce((sum, inst) => sum + (Number(inst.amount) || 0), 0);
  }, 0);
}

function getAvailableLimit() {
  const total = getTotalLimit();
  return Math.max(0, total - getAmountUsed());
}

function getUtilisationPct() {
  const total = getTotalLimit();
  if (total <= 0) return 0;
  return Math.round((getAmountUsed() / total) * 100);
}

/**
 * Flattens all instalments across purchases for tracking and rendering
 */
function getAllInstalments() {
  const list = [];
  if (!appState.purchases || !Array.isArray(appState.purchases)) return list;

  appState.purchases.forEach(p => {
    (p.instalments || []).forEach((inst, idx) => {
      list.push({
        ...inst,
        purchaseId: p.id,
        item: p.item,
        icon: p.icon || '🛍️',
        totalInstalments: p.instalments.length,
        partIndex: idx + 1
      });
    });
  });

  // Sort by dueWeek ascending, then by status
  return list.sort((a, b) => a.dueWeek - b.dueWeek);
}

/**
 * Evaluates the status of an instalment based on current simulated week
 */
function getInstalmentStatus(inst) {
  if (inst.status === 'paid') {
    return {
      key: 'paid',
      label: inst.paidOnTime ? 'Paid on time ✓' : 'Paid late',
      badgeClass: inst.paidOnTime ? 'status-paid-on-time' : 'status-paid-late'
    };
  }

  const { currentWeek } = appState;
  if (inst.dueWeek > currentWeek + 1) {
    return {
      key: 'upcoming',
      label: 'Upcoming',
      badgeClass: 'status-upcoming'
    };
  } else if (inst.dueWeek === currentWeek + 1) {
    return {
      key: 'due_soon',
      label: 'Due soon',
      badgeClass: 'status-due-soon'
    };
  } else if (inst.dueWeek === currentWeek) {
    return {
      key: 'due_this_week',
      label: 'Due this week',
      badgeClass: 'status-due-this-week'
    };
  } else {
    return {
      key: 'overdue',
      label: 'Overdue',
      badgeClass: 'status-overdue'
    };
  }
}

/**
 * Checks whether any unpaid instalment is past due
 */
function hasOverdueInstalments() {
  const all = getAllInstalments();
  return all.some(inst => inst.status !== 'paid' && inst.dueWeek < appState.currentWeek);
}

// ----------------------------------------------------
// LEVEL UP PROGRESSION & REPAYMENT CYCLES ENGINE (STAGE 4 BUGFIX)
// ----------------------------------------------------
/**
 * Evaluates all due weeks (repayment cycles) across stored purchases.
 * Returns structured metadata for each due week, including:
 * - totalCount, paidCount, unpaidCount, onTimeCount, lateCount
 * - isQualified: all instalments due in that week paid on time (paidWeek <= dueWeek)
 * - isDisqualified: any instalment paid late or currently unpaid past its due week
 * - isPartial: some paid on time, some unpaid, not yet overdue or late
 * - progressText: e.g. "2 of 3 payments done for Week 3"
 */
function getCyclesSummary() {
  const allInstalments = getAllInstalments();
  const cyclesByWeek = {};

  allInstalments.forEach(inst => {
    const w = inst.dueWeek;
    if (!cyclesByWeek[w]) {
      cyclesByWeek[w] = {
        dueWeek: w,
        totalCount: 0,
        paidCount: 0,
        unpaidCount: 0,
        onTimeCount: 0,
        lateCount: 0,
        instalments: []
      };
    }
    cyclesByWeek[w].totalCount += 1;
    cyclesByWeek[w].instalments.push(inst);
    if (inst.status === 'paid') {
      cyclesByWeek[w].paidCount += 1;
      if (inst.paidOnTime && inst.paidWeek <= inst.dueWeek) {
        cyclesByWeek[w].onTimeCount += 1;
      } else {
        cyclesByWeek[w].lateCount += 1;
      }
    } else {
      cyclesByWeek[w].unpaidCount += 1;
    }
  });

  const weeks = Object.keys(cyclesByWeek).map(Number).sort((a, b) => a - b);
  return weeks.map(w => {
    const c = cyclesByWeek[w];
    const isPastDue = w < appState.currentWeek;
    const isOverdue = c.unpaidCount > 0 && isPastDue;
    const isFullyPaid = c.paidCount === c.totalCount;
    // Disqualified if any late payment, or past due with unpaid instalments
    const isDisqualified = c.lateCount > 0 || isOverdue;
    // Qualified if ALL instalments paid on time and none late
    const isQualified = isFullyPaid && c.onTimeCount === c.totalCount && c.lateCount === 0;
    // Partial progress: paying some but not all instalments due in a week (and not disqualified)
    const isPartial = c.paidCount > 0 && c.paidCount < c.totalCount && !isDisqualified;

    let progressText = '';
    if (isPartial) {
      progressText = `${c.paidCount} of ${c.totalCount} payments done for Week ${w}`;
    } else if (isQualified) {
      progressText = `All ${c.totalCount} of ${c.totalCount} payments done on time for Week ${w}`;
    } else if (isDisqualified) {
      if (c.lateCount > 0) {
        progressText = `Late payment in Week ${w} (cycle disqualified)`;
      } else {
        progressText = `Overdue payment in Week ${w} (cycle disqualified)`;
      }
    } else {
      progressText = `0 of ${c.totalCount} payments done for Week ${w}`;
    }

    return {
      ...c,
      isOverdue,
      isFullyPaid,
      isQualified,
      isDisqualified,
      isPartial,
      progressText
    };
  });
}

/**
 * Evaluates qualified due weeks and updates ladder progress.
 * Rules:
 * - A repayment counts toward the ladder once per due week (repayment cycle), not once per instalment.
 * - A due week counts as one on-time repayment only when ALL instalments due in that week have been paid,
 *   and each was paid in or before its due week.
 * - At most one count can be earned per due week. Late payments never count, and a week with any late
 *   or unpaid instalment earns nothing.
 */
function evaluateRepaymentCycles() {
  if (!Array.isArray(appState.completedDueWeeksAtCurrentLevel)) {
    appState.completedDueWeeksAtCurrentLevel = [];
  }
  if (!Array.isArray(appState.creditedDueWeeks)) {
    appState.creditedDueWeeks = [];
  }

  const cycles = getCyclesSummary();

  cycles.forEach(c => {
    // Only qualify if not already credited in past or current level
    if (appState.creditedDueWeeks.includes(c.dueWeek)) return;

    if (c.isQualified) {
      appState.completedDueWeeksAtCurrentLevel.push(c.dueWeek);
      appState.creditedDueWeeks.push(c.dueWeek);
    }
  });

  appState.repaymentsCompletedAtCurrentLevel = appState.completedDueWeeksAtCurrentLevel.length;
}

function checkAndTriggerLevelUp() {
  // Max level is Level 3
  if (appState.level >= 3) return;

  // Level-up requires 2 on-time repayment cycles at current level
  if ((appState.completedDueWeeksAtCurrentLevel || []).length < 2) return;

  // RULE: Do not level up while any instalment is overdue
  if (hasOverdueInstalments()) return;

  // TRIGGER LEVEL UP!
  const fromLevel = appState.level;
  const toLevel = fromLevel + 1;
  const oldLimit = LEVELS[fromLevel].limit;
  const newLimit = LEVELS[toLevel].limit;
  const newLevelName = LEVELS[toLevel].name;
  const reason = "You repaid 2 repayment cycles on time and kept your usage steady. That's real proof of reliable habits, so your limit goes up.";

  appState.level = toLevel;
  appState.currentLimit = newLimit;
  appState.completedDueWeeksAtCurrentLevel = []; // Resets to 0 of 2 for next level
  appState.repaymentsCompletedAtCurrentLevel = 0; // Ladder resets to 0 of 2 for next level

  if (!appState.levelUpHistory) appState.levelUpHistory = [];
  appState.levelUpHistory.unshift({
    fromLevel,
    toLevel,
    fromLevelName: LEVELS[fromLevel].name,
    toLevelName: newLevelName,
    oldLimit,
    newLimit,
    week: appState.currentWeek,
    reason
  });

  // Trigger celebration modal
  appState.pendingCelebration = {
    fromLevel,
    toLevel,
    oldLimit,
    newLimit,
    newLevelName,
    reason
  };
}

// ----------------------------------------------------
// UTILISATION NUDGE CARD LOGIC (STAGE 2)
// ----------------------------------------------------
function getNudgeData(pct) {
  if (pct === 0) return null;

  if (pct < 50) {
    return {
      class: 'nudge-under-50',
      icon: '🌿',
      title: 'Nice & Steady',
      message: `Nice and steady. You've used ${pct}% of your limit.`
    };
  } else if (pct < 70) {
    return {
      class: 'nudge-50-69',
      icon: '💡',
      title: 'Budgeting Tip',
      message: `You've used ${pct}% of your limit. Leaving some room keeps repayment comfortable.`
    };
  } else {
    return {
      class: 'nudge-70-plus',
      icon: '⚠️',
      title: 'Heads Up: High Utilisation',
      message: `This used ${pct}% of your limit. Here's what that means: you'll have less room for surprises, and repaying will take a bigger share of your \u20B98,000 a month.`
    };
  }
}

// ----------------------------------------------------
// DEMO CONTROLS LOGIC
// ----------------------------------------------------
function skipWeek() {
  appState.currentWeek += 1;

  // Add ₹450 to savings each week, capped at ₹3,600
  const currentSaved = Number(appState.savings.currentAmount || 0);
  const cap = Number(appState.savings.capAmount || 3600);
  const increment = Number(appState.savings.weeklyAddition || 450);
  appState.savings.currentAmount = Math.min(cap, currentSaved + increment);

  saveState();
  renderApp();

  // Highlight week indicator on Home with a pulse animation
  const homeBadge = document.getElementById('homeWeekBadge');
  if (homeBadge) {
    homeBadge.classList.remove('pulse');
    void homeBadge.offsetWidth; // trigger reflow
    homeBadge.classList.add('pulse');
  }

  // Highlight savings card with a subtle green pulse
  const savingsCard = document.getElementById('homeSavingsCard');
  if (savingsCard) {
    savingsCard.classList.remove('pulse-green');
    void savingsCard.offsetWidth; // trigger reflow
    savingsCard.classList.add('pulse-green');
  }
}

function toggleScreen() {
  if (appState.currentScreen === 'onboarding') {
    appState.currentScreen = 'home';
  } else if (appState.currentScreen === 'home') {
    appState.currentScreen = 'spend';
  } else if (appState.currentScreen === 'spend') {
    appState.currentScreen = 'repay';
  } else if (appState.currentScreen === 'repay') {
    appState.currentScreen = 'levelup';
  } else {
    appState.currentScreen = 'onboarding';
  }
  saveState();
  renderApp();
}

function resetDemoState() {
  appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  blockedNotice = null;
  saveState();
  renderApp();
}

// ----------------------------------------------------
// SPEND ACTION HANDLER (STAGE 2)
// ----------------------------------------------------
function purchaseItem(itemId) {
  // If any instalment is overdue, block purchases with calm supportive message
  if (hasOverdueInstalments()) {
    blockedNotice = {
      message: 'No stress. Pay when you can. New spending is paused until this is cleared. Head over to the Repay screen to clear your overdue instalment.'
    };
    renderApp();
    return;
  }

  const option = PURCHASE_OPTIONS.find(o => o.id === itemId);
  if (!option) return;

  const available = getAvailableLimit();

  // Block any purchase exceeding the available limit
  if (option.amount > available) {
    blockedNotice = {
      message: `Purchase blocked: "${option.item}" costs ${formatINR(option.amount)}, but you only have ${formatINR(available)} available. Ascend prevents overborrowing so you stay well within your \u20B98,000/month budget!`
    };
    renderApp();
    return;
  }

  // Clear any existing blocked warning
  blockedNotice = null;

  // Store purchase and repayment plan: 2 equal instalments
  const instalmentAmount = option.amount / 2;
  const newPurchase = {
    id: 'pur_' + Date.now(),
    item: option.item,
    amount: option.amount,
    icon: option.icon,
    weekPurchased: appState.currentWeek,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    instalments: [
      {
        instalmentNumber: 1,
        amount: instalmentAmount,
        dueWeek: appState.currentWeek + 2,
        status: 'pending'
      },
      {
        instalmentNumber: 2,
        amount: instalmentAmount,
        dueWeek: appState.currentWeek + 4,
        status: 'pending'
      }
    ]
  };

  appState.purchases.unshift(newPurchase);
  saveState();
  renderApp();
}

// ----------------------------------------------------
// REPAY ACTION HANDLER (STAGE 3 & 4)
// ----------------------------------------------------
function payInstalment(purchaseId, instalmentNumber) {
  const purchase = (appState.purchases || []).find(p => p.id === purchaseId);
  if (!purchase) return;

  const inst = (purchase.instalments || []).find(i => i.instalmentNumber === Number(instalmentNumber));
  if (!inst || inst.status === 'paid') return;

  const { currentWeek } = appState;
  const isOnTime = currentWeek <= inst.dueWeek;

  // Mark instalment as paid
  inst.status = 'paid';
  inst.paidOnTime = isOnTime;
  inst.paidWeek = currentWeek;

  // Evaluate cycles per rule: a due week counts only when ALL instalments due in that week are paid on time
  evaluateRepaymentCycles();

  // Check if this payment completes level-up conditions!
  checkAndTriggerLevelUp();

  // Clear any active spending blocked notice if overdue was cleared
  if (!hasOverdueInstalments() && blockedNotice && blockedNotice.message.includes('No stress')) {
    blockedNotice = null;
  }

  saveState();
  renderApp();
}

// ----------------------------------------------------
// SCREEN 1: ONBOARDING RENDERER
// ----------------------------------------------------
function renderOnboarding() {
  const { persona, onboardingStep } = appState;
  const currentLimit = getTotalLimit();

  if (onboardingStep === 'consent') {
    return `
      <div class="screen-view">
        <!-- Header & Persona Tag -->
        <div class="onboarding-brand">
          <div class="brand-badge">
            <span class="brand-dot"></span>
            <span>Ascend</span>
          </div>
          <span class="pill-persona">${persona.name}, ${persona.age} • ₹8k/mo</span>
        </div>

        <!-- Hero Title -->
        <div class="onboarding-hero">
          <h1 class="onboarding-title">Your first credit line, zero credit history needed.</h1>
          <p class="onboarding-subtitle">Designed specifically for 18–24 year olds to build safe financial standing.</p>
        </div>

        <!-- UPI Consent Card -->
        <div class="consent-box">
          <div class="consent-header">
            <div class="consent-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div>
              <h2 class="consent-title">Why read-only UPI activity?</h2>
              <p class="consent-desc">No CIBIL score? That's completely normal at 20.</p>
            </div>
          </div>

          <div class="consent-features">
            <div class="feature-item">
              <div class="feature-icon-check">✓</div>
              <div class="feature-text">
                <strong>Cashflow over credit score:</strong> We verify your regular monthly UPI inflows (~₹8,000/mo) instead of demanding a past borrowing record.
              </div>
            </div>

            <div class="feature-item">
              <div class="feature-icon-check">✓</div>
              <div class="feature-text">
                <strong>100% Read-Only &amp; Safe:</strong> We cannot move money, debit your account, or see your UPI PIN/passwords.
              </div>
            </div>

            <div class="feature-item">
              <div class="feature-icon-check">✓</div>
              <div class="feature-text">
                <strong>Instant Credit Starter:</strong> Qualify for a starting limit of ${formatINR(currentLimit)} with zero paperwork or delays.
              </div>
            </div>
          </div>

          <!-- Mock UPI ID display -->
          <div class="upi-simulation-mock">
            <div class="upi-id-tag">
              <span class="upi-badge">UPI</span>
              <span class="upi-val">${persona.upiId}</span>
            </div>
            <div class="upi-income-tag">
              Detected: <strong>₹8,000/mo</strong>
            </div>
          </div>

          <!-- Consent CTA -->
          <button id="btnGrantConsent" class="btn-primary" type="button">
            <span>Grant Consent &amp; Verify Profile</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>

          <div class="privacy-notice">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>RBI Account Aggregator compliant • Encrypted</span>
          </div>
        </div>
      </div>
    `;
  }

  if (onboardingStep === 'verifying') {
    return `
      <div class="screen-view">
        <div class="verifying-container">
          <div class="loader-spinner"></div>
          <div>
            <h2 style="font-size:1.25rem; font-weight:800; color:var(--slate-900);">Verifying UPI Activity...</h2>
            <p style="font-size:0.82rem; color:var(--slate-500); margin-top:4px;">Connecting read-only stream for ${persona.upiId}</p>
          </div>

          <div class="verification-steps">
            <div class="verif-step-row completed">
              <span>✓</span>
              <span>UPI Handle Verified: <strong>${persona.upiId}</strong></span>
            </div>
            <div class="verif-step-row completed">
              <span>✓</span>
              <span>Past 90 days cashflow analyzed: <strong>₹8,000/mo</strong></span>
            </div>
            <div class="verif-step-row completed">
              <span>✓</span>
              <span>Zero default or high-risk flags detected</span>
            </div>
            <div class="verif-step-row completed">
              <span>✓</span>
              <span>Starting limit computed safely at 50% income</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // onboardingStep === 'verified'
  return `
    <div class="screen-view">
      <div class="onboarding-brand">
        <div class="brand-badge">
          <span class="brand-dot"></span>
          <span>Ascend</span>
        </div>
        <span class="badge-stage">Ready</span>
      </div>

      <div class="verified-card">
        <div class="verified-shield-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
        </div>

        <span class="verified-badge-pill">Profile Verified</span>
        <h2 class="verified-title">Welcome to Ascend, ${persona.name}!</h2>
        <p style="font-size:0.82rem; color:var(--slate-500); margin-top:-6px;">Your UPI income profile has been safely approved.</p>

        <!-- Starting Limit Spotlight -->
        <div class="limit-display-card">
          <div class="limit-lbl">Starting Credit Limit</div>
          <div class="limit-amt">${formatINR(currentLimit)}</div>
          <div class="limit-rationale">
            💡 <strong>Why ${formatINR(currentLimit)}?</strong> Set responsibly at 50% of your ₹8,000 monthly income. This ensures you can build repayment discipline with zero risk of overborrowing.
          </div>
        </div>

        <div class="verified-highlights">
          <div class="verified-highlights-item">
            <span style="color:var(--emerald);">✓</span>
            <span>Interest-free repayment when paid in 2 instalments</span>
          </div>
          <div class="verified-highlights-item">
            <span style="color:var(--emerald);">✓</span>
            <span>Repaying 2 on-time unlocks Level 2 (${formatINR(LEVELS[2].limit)})</span>
          </div>
        </div>

        <button id="btnProceedToHome" class="btn-primary" type="button" style="margin-top:0.5rem;">
          <span>Explore Your Ascend Home</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// SCREEN 2: HOME RENDERER (STAGE 4: Updated Ladder & Levels)
// ----------------------------------------------------
function renderHome() {
  const { persona, level, repaymentsCompletedAtCurrentLevel, currentWeek, savings } = appState;

  const currentLevelConfig = LEVELS[level] || LEVELS[1];
  const totalLimit = getTotalLimit();
  const amountUsed = getAmountUsed();
  const availableLimit = getAvailableLimit();
  const utilisationPct = getUtilisationPct();
  const nextLvlConfig = currentLevelConfig.nextLevel ? LEVELS[currentLevelConfig.nextLevel] : null;

  const currentSaved = Number(savings.currentAmount || 0);
  const targetSaved = Number(savings.targetAmount || 3600);
  const savingsProgressPct = Math.min(100, Math.round((currentSaved / targetSaved) * 100));
  const savingsRemaining = Math.max(0, targetSaved - currentSaved);

  const cycles = getCyclesSummary();
  const partialCycles = cycles.filter(c => c.isPartial);

  return `
    <div class="screen-view">
      <!-- Top App Bar / User Greeting -->
      <header class="home-header">
        <div class="home-user-meta">
          <div class="home-avatar">
            ${persona.name.charAt(0)}
            <span class="avatar-online-dot"></span>
          </div>
          <div class="home-greeting-text">
            <h2>Hi, ${persona.name} 👋</h2>
            <p>Income: ₹${persona.monthlyIncome.toLocaleString('en-IN')}/mo • ${persona.college}</p>
          </div>
        </div>

        <div class="home-week-badge" id="homeWeekBadge" title="Current simulated week">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span>Week ${currentWeek}</span>
        </div>
      </header>

      <!-- Card 1: Credit Limit Card (Shows Level Name, Available, Used & Utilisation %) -->
      <section class="credit-card-hero">
        <div class="card-top-row">
          <span class="card-type">Ascend Credit Line</span>
          <div class="card-level-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>Level ${level}: ${currentLevelConfig.name}</span>
          </div>
        </div>

        <div class="card-limit-main">
          <div class="card-limit-label">Available to Spend</div>
          <div class="card-limit-amount">${formatINR(availableLimit)}</div>
        </div>

        <!-- Dynamic Utilisation Meter -->
        <div class="utilisation-track-wrap" style="margin-bottom:0.85rem;">
          <div class="utilisation-track-bar">
            <div class="utilisation-track-fill ${utilisationPct < 50 ? 'tier-green' : utilisationPct < 70 ? 'tier-amber' : 'tier-warning'}" style="width: ${Math.min(100, utilisationPct)}%;"></div>
          </div>
          <div class="utilisation-labels-row">
            <span>Used: <strong>${formatINR(amountUsed)}</strong></span>
            <span><strong>${utilisationPct}%</strong> utilised</span>
          </div>
        </div>

        <div class="card-meta-bar">
          <div>Total Limit: <strong>${formatINR(totalLimit)}</strong></div>
          <span class="status-pill-safe" style="${utilisationPct >= 70 ? 'background:rgba(239,68,68,0.25); border-color:rgba(239,68,68,0.5); color:#FCA5A5;' : utilisationPct >= 50 ? 'background:rgba(245,158,11,0.25); border-color:rgba(245,158,11,0.5); color:#FCD34D;' : ''}">
            ${utilisationPct === 0 ? '100% Available' : utilisationPct + '% Utilised'}
          </span>
        </div>
      </section>

      <!-- Card 2: Progress Ladder (Shows Current Level & Progress to Next) -->
      <section class="ladder-section">
        <div class="section-heading">
          <h3 class="section-title">Level Progression Ladder</h3>
          <span class="section-pill">${level === 3 ? 'Max Level' : `Next: Level ${level + 1}`}</span>
        </div>

        <div class="ladder-card">
          <div class="ladder-header-row">
            <div class="ladder-goal-desc">
              <span class="ladder-goal-title">
                ${level < 3 
                  ? `Progress to Level ${level + 1} (${nextLvlConfig.name} - ${formatINR(nextLvlConfig.limit)})` 
                  : `Level 3 Achiever (${formatINR(totalLimit)} Limit)`}
              </span>
              <span class="ladder-goal-sub">
                ${level < 3 
                  ? `${repaymentsCompletedAtCurrentLevel || 0} of 2 on-time repayment cycles completed at Level ${level}` 
                  : 'Highest micro-credit tier achieved!'}
              </span>
              ${partialCycles.length > 0 ? `
                <div class="cycle-progress-box">
                  ${partialCycles.map(c => `
                    <div class="cycle-progress-pill">
                      <span>⏳ <strong>${c.progressText}</strong> (all needed for 1 ladder count)</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            <span class="ladder-fraction">${level < 3 ? `${repaymentsCompletedAtCurrentLevel || 0}/2` : 'MAX'}</span>
          </div>

          <!-- Stepper / Ladder Graphic -->
          <div class="stepper-container">
            <div class="stepper-track-bg"></div>
            <div class="stepper-track-fill" style="width: ${level >= 3 ? 100 : ((repaymentsCompletedAtCurrentLevel || 0) / 2) * 100}%;"></div>
            
            <div class="stepper-nodes">
              <!-- Cycle 1 -->
              <div class="step-node ${level >= 3 || (repaymentsCompletedAtCurrentLevel || 0) >= 1 ? 'completed' : 'current'}">
                <div class="node-circle">${level >= 3 || (repaymentsCompletedAtCurrentLevel || 0) >= 1 ? '✓' : '1'}</div>
                <span class="node-label">Cycle 1</span>
              </div>

              <!-- Cycle 2 -->
              <div class="step-node ${level >= 3 || (repaymentsCompletedAtCurrentLevel || 0) >= 2 ? 'completed' : (repaymentsCompletedAtCurrentLevel || 0) === 1 ? 'current' : ''}">
                <div class="node-circle">${level >= 3 || (repaymentsCompletedAtCurrentLevel || 0) >= 2 ? '✓' : '2'}</div>
                <span class="node-label">Cycle 2</span>
              </div>

              <!-- Level Up Reward -->
              <div class="step-node reward ${level >= 3 ? 'completed' : ''}">
                <div class="node-circle">★</div>
                <span class="node-label">${level < 3 ? formatINR(nextLvlConfig.limit) : 'Unlocked'}</span>
              </div>
            </div>
          </div>

          <div class="ladder-tip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--primary); flex-shrink:0; margin-top:1px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>
              ${level === 3 
                ? "You've built a strong repayment record. Next unlock: savings-backed purchase credit." 
                : `Complete 2 on-time repayment cycles at Level ${level} (${currentLevelConfig.name}) to increase your limit to ${formatINR(nextLvlConfig.limit)}. 1 count earned per due week when all instalments are paid on time.`}
            </span>
          </div>
        </div>
      </section>

      <!-- Card 3: Savings Goal Card -->
      <section class="savings-card" id="homeSavingsCard">
        <div class="savings-header">
          <div class="savings-target-title">
            <span class="savings-emoji-icon">📱</span>
            <span>${savings.item} (₹12,000)</span>
          </div>
          <span class="savings-target-chip">Target: ${formatINR(targetSaved)}</span>
        </div>

        <div class="savings-progress-bar-wrap">
          <div class="savings-progress-bar-fill" style="width: ${savingsProgressPct}%;"></div>
        </div>

        <div class="savings-numbers-row">
          <span class="savings-current">Saved: <strong>${formatINR(currentSaved)}</strong> (${savingsProgressPct}%)</span>
          <span class="savings-remain">${savingsRemaining === 0 ? '🎉 Goal reached! (₹0 left to go)' : formatINR(savingsRemaining) + ' left to go'}</span>
        </div>

        <div class="savings-insight-nudge">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px;">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          <span>Saving ₹450/week from ₹8,000 income (capped at ₹3,600). Ascend limits your credit safely so your phone deposit fund stays protected.</span>
        </div>
      </section>

      <!-- Quick Actions: Direct links to Spend, Repay & Level Up screens -->
      <div class="stage-preview-row">
        <button id="btnGoToSpend" class="stage-preview-btn" type="button" style="border-style:solid; border-color:var(--primary); background:var(--primary-light);">
          <span class="stage-preview-badge" style="background:var(--primary); color:var(--white);">Active</span>
          <span class="stage-preview-title">🛍️ Spend Screen →</span>
          <span class="stage-preview-sub">Make purchases &amp; see nudges</span>
        </button>

        <button id="btnGoToRepay" class="stage-preview-btn" type="button" style="border-style:solid; border-color:var(--primary); background:var(--primary-light);">
          <span class="stage-preview-badge" style="background:var(--primary); color:var(--white);">Active</span>
          <span class="stage-preview-title">💳 Repay Screen →</span>
          <span class="stage-preview-sub">${hasOverdueInstalments() ? '⚠️ Overdue pending' : 'Pay on-time for Level Up'}</span>
        </button>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// SCREEN 3: SPEND RENDERER (STAGE 2)
// ----------------------------------------------------
function renderSpend() {
  const { currentWeek, purchases } = appState;
  const totalLimit = getTotalLimit();
  const amountUsed = getAmountUsed();
  const availableLimit = getAvailableLimit();
  const utilisationPct = getUtilisationPct();
  const nudge = getNudgeData(utilisationPct);
  const isSpendingPaused = hasOverdueInstalments();

  return `
    <div class="screen-view">
      <!-- Spend Screen Header -->
      <div class="onboarding-brand" style="margin-bottom: -0.25rem;">
        <div class="brand-badge">
          <span class="brand-dot"></span>
          <span>Spend with Ascend</span>
        </div>
        <span class="pill-persona">Week ${currentWeek}</span>
      </div>

      <!-- Top Limit Summary Card -->
      <section class="spend-hero-card">
        <div class="spend-limit-header">
          <div class="spend-limit-meta">
            <span class="spend-limit-label">Available Limit</span>
            <div class="spend-avail-amount">${formatINR(availableLimit)}</div>
            <span class="spend-avail-sub">of ${formatINR(totalLimit)} Total Line (Level ${appState.level})</span>
          </div>

          <div class="spend-used-badge">
            <span class="spend-used-lbl">Amount Used</span>
            <span class="spend-used-val">${formatINR(amountUsed)}</span>
            <span style="font-size:0.65rem; color:#A5B4FC; margin-top:2px;">${utilisationPct}% Utilised</span>
          </div>
        </div>

        <div class="utilisation-track-wrap">
          <div class="utilisation-track-bar">
            <div class="utilisation-track-fill ${utilisationPct < 50 ? 'tier-green' : utilisationPct < 70 ? 'tier-amber' : 'tier-warning'}" style="width: ${Math.min(100, utilisationPct)}%;"></div>
          </div>
          <div class="utilisation-labels-row">
            <span>${formatINR(amountUsed)} used</span>
            <span>${formatINR(availableLimit)} remaining</span>
          </div>
        </div>
      </section>

      <!-- Calm Overdue Pause Banner (When Any Instalment is Overdue) -->
      ${isSpendingPaused ? `
        <div class="spending-paused-banner">
          <div style="font-size:1.35rem; flex-shrink:0;">🤝</div>
          <div style="flex:1;">
            <strong>No stress. Pay when you can. New spending is paused until this is cleared.</strong>
            <div style="font-size:0.75rem; margin-top:4px;">Visit the <strong>Repay</strong> screen to clear your overdue instalment and resume spending.</div>
          </div>
        </div>
      ` : ''}

      <!-- Friendly Limit-Exceeded Block Banner -->
      ${blockedNotice ? `
        <div class="blocked-alert-banner" id="blockedAlertBanner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0; margin-top:1px;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div style="flex:1;">
            <strong>${blockedNotice.message}</strong>
          </div>
          <button id="btnDismissAlert" type="button" style="background:none; border:none; color:inherit; font-weight:800; font-size:1.15rem; cursor:pointer; line-height:1;" title="Dismiss">&times;</button>
        </div>
      ` : ''}

      <!-- Dynamic Utilisation Nudge Card -->
      ${nudge ? `
        <div class="nudge-card ${nudge.class}">
          <div class="nudge-icon">${nudge.icon}</div>
          <div class="nudge-content">
            <span class="nudge-title">${nudge.title}</span>
            <p>${nudge.message}</p>
          </div>
        </div>
      ` : ''}

      <!-- Purchase Options List -->
      <section class="purchase-options-section">
        <div class="section-heading">
          <h3 class="section-title">Purchase Options</h3>
          <span class="section-pill">${isSpendingPaused ? 'Spending Paused' : 'Tap to Buy'}</span>
        </div>

        <div class="purchase-options-grid">
          ${PURCHASE_OPTIONS.map(opt => {
            const isExceeding = opt.amount > availableLimit;
            return `
              <button class="purchase-option-card ${isSpendingPaused ? 'spending-paused' : ''} ${isExceeding ? 'exceeds-limit' : ''}" data-item-id="${opt.id}" type="button">
                <div class="option-icon-wrap">${opt.icon}</div>
                <span class="option-item-name">${opt.item}</span>
                <span class="option-item-price">${formatINR(opt.amount)}</span>
                <div class="option-btn-tap">
                  ${isSpendingPaused ? 'Spending Paused ⏸' : isExceeding ? `Exceeds Limit ⚠️` : 'Tap to Buy →'}
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </section>

      <!-- Purchase History List & Repayment Plan Preview -->
      <section class="history-section">
        <div class="section-heading">
          <h3 class="section-title">Purchase History (${purchases.length})</h3>
          <span class="section-pill">2-Part Repayment Plan</span>
        </div>

        ${purchases.length === 0 ? `
          <div class="card-white" style="text-align:center; padding:1.5rem 1rem; color:var(--slate-500); font-size:0.8rem;">
            🛒 No purchases made yet. Tap an option above to simulate a purchase and automatically schedule its 2-part repayment plan.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:0.65rem;">
            ${purchases.map(p => `
              <div class="history-card-item">
                <div class="history-top-row">
                  <div class="history-item-left">
                    <span style="font-size:1.25rem;">${p.icon || '🛍️'}</span>
                    <div>
                      <div class="history-name">${p.item}</div>
                      <span class="history-week-tag">Purchased in Week ${p.weekPurchased}</span>
                    </div>
                  </div>
                  <span class="history-amt">-${formatINR(p.amount)}</span>
                </div>

                <div class="history-instalment-plan">
                  <span>Plan: 2x <strong>${formatINR(p.instalments[0].amount)}</strong></span>
                  <span>Due: Wk ${p.instalments[0].dueWeek} &amp; Wk ${p.instalments[1].dueWeek}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>
    </div>
  `;
}

// ----------------------------------------------------
// SCREEN 4: REPAY RENDERER (STAGE 3)
// ----------------------------------------------------
function renderRepay() {
  const { level, currentWeek, repaymentsCompletedAtCurrentLevel } = appState;
  const amountUsed = getAmountUsed();
  const allInstalments = getAllInstalments();
  const unpaidInstalments = allInstalments.filter(i => i.status !== 'paid');

  const cycles = getCyclesSummary();
  const partialCycles = cycles.filter(c => c.isPartial);
  const cyclesMap = {};
  cycles.forEach(c => { cyclesMap[c.dueWeek] = c; });

  // Categorize for reminders
  const overdueInstalments = unpaidInstalments.filter(i => i.dueWeek < currentWeek);
  const dueThisWeekInstalments = unpaidInstalments.filter(i => i.dueWeek === currentWeek);
  const dueSoonInstalments = unpaidInstalments.filter(i => i.dueWeek === currentWeek + 1);

  // Pick primary reminder target
  const reminderTarget = dueThisWeekInstalments.length > 0 
    ? dueThisWeekInstalments[0] 
    : (dueSoonInstalments.length > 0 ? dueSoonInstalments[0] : null);

  return `
    <div class="screen-view">
      <!-- Repay Header -->
      <div class="onboarding-brand" style="margin-bottom: -0.25rem;">
        <div class="brand-badge">
          <span class="brand-dot"></span>
          <span>Repay with Ascend</span>
        </div>
        <span class="pill-persona">Week ${currentWeek}</span>
      </div>

      <!-- Repay Summary Card -->
      <section class="repay-summary-card">
        <div class="repay-summary-top">
          <div>
            <span class="repay-summary-lbl">Outstanding Balance</span>
            <div class="repay-summary-amt">${formatINR(amountUsed)}</div>
          </div>
          <div class="repay-progress-pill">
            ★ Level ${level}: ${repaymentsCompletedAtCurrentLevel || 0}/2 Cycles On-time
          </div>
        </div>

        <div style="font-size:0.75rem; color:#C7D2FE; display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.12); padding-top:0.6rem;">
          <span>Unpaid Instalments: <strong>${unpaidInstalments.length}</strong></span>
          <span>Available to Spend: <strong>${formatINR(getAvailableLimit())}</strong></span>
        </div>
      </section>

      <!-- Cycle Progress Alert Banner (Shows "X of Y payments done for Week W") -->
      ${partialCycles.length > 0 ? `
        <div class="cycle-alert-banner">
          <div style="font-size:1.35rem; flex-shrink:0;">⏳</div>
          <div style="flex:1;">
            <strong>Cycle Progress in Motion:</strong>
            ${partialCycles.map(c => `
              <div style="font-size:0.8rem; margin-top:2px;">
                • <strong>${c.progressText}</strong>. All payments due in Week ${c.dueWeek} must be completed on time to earn 1 ladder count.
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- 1. Overdue Supportive Card (Calm, Supportive, No Shaming) -->
      ${overdueInstalments.length > 0 ? `
        <div class="repay-overdue-banner">
          <div style="font-size:1.4rem; flex-shrink:0;">🤝</div>
          <div style="flex:1;">
            <strong>No stress. Pay when you can. New spending is paused until this is cleared.</strong>
            <p style="font-size:0.75rem; margin-top:3px; color:#BE123C;">
              You have ${overdueInstalments.length} overdue instalment(s). Tapping "Pay now" clears it immediately and unlocks new spending.
            </p>
          </div>
        </div>
      ` : ''}

      <!-- 2. Friendly Reminder Card (Due soon / Due this week) -->
      ${overdueInstalments.length === 0 && reminderTarget ? `
        <div class="repay-reminder-card">
          <div style="font-size:1.35rem; flex-shrink:0;">🔔</div>
          <div style="flex:1;">
            <strong>Your ${formatINR(reminderTarget.amount)} instalment for ${reminderTarget.item} is due in Week ${reminderTarget.dueWeek}. A quick payment now keeps your progress on track.</strong>
          </div>
        </div>
      ` : ''}

      <!-- Instalment Schedule List -->
      <section class="instalments-section" style="display:flex; flex-direction:column; gap:0.75rem;">
        <div class="section-heading">
          <h3 class="section-title">All Instalments (${allInstalments.length})</h3>
          <span class="section-pill">${unpaidInstalments.length} Unpaid</span>
        </div>

        ${allInstalments.length === 0 ? `
          <div class="card-white" style="text-align:center; padding:2rem 1.25rem; color:var(--slate-500); font-size:0.82rem; line-height:1.5;">
            💳 <strong>No active instalment plans.</strong><br>
            Visit the <strong>Spend</strong> tab and tap any item to make a purchase. Each purchase automatically generates a 2-part instalment plan here.
          </div>
        ` : `
          <div class="instalments-list">
            ${allInstalments.map(inst => {
              const status = getInstalmentStatus(inst);
              const isOverdue = status.key === 'overdue';
              const isDueThisWeek = status.key === 'due_this_week';
              const isPaid = inst.status === 'paid';
              const cycle = cyclesMap[inst.dueWeek];

              return `
                <div class="instalment-card ${isOverdue ? 'is-overdue' : ''} ${isDueThisWeek ? 'is-due-this-week' : ''}">
                  <div class="instalment-card-header">
                    <div class="instalment-item-info">
                      <div class="instalment-title">
                        <span>${inst.icon} ${inst.item}</span>
                        <span style="font-weight:600; color:var(--slate-500); font-size:0.75rem;">(Part ${inst.partIndex} of ${inst.totalInstalments})</span>
                      </div>
                      <div class="instalment-due-tag">
                        ${isPaid ? `Paid in Week ${inst.paidWeek}` : `Due Week ${inst.dueWeek} (Current: Week ${currentWeek})`}
                      </div>
                      ${cycle && cycle.totalCount > 1 ? `
                        <div class="cycle-tag-row">
                          <span class="cycle-tag ${cycle.isQualified ? 'cycle-tag-qualified' : cycle.isPartial ? 'cycle-tag-partial' : cycle.isDisqualified ? 'cycle-tag-disqualified' : ''}">
                            ${cycle.isPartial
                              ? `⏳ ${cycle.progressText}`
                              : cycle.isQualified
                                ? `✓ Week ${inst.dueWeek} cycle qualified (+1 ladder)`
                                : cycle.isDisqualified
                                  ? `⚠️ Week ${inst.dueWeek} cycle disqualified`
                                  : `Week ${inst.dueWeek} cycle: 0 of ${cycle.totalCount} paid`}
                          </span>
                        </div>
                      ` : ''}
                    </div>

                    <span class="status-badge ${status.badgeClass}">
                      ${status.label}
                    </span>
                  </div>

                  <div class="instalment-action-row">
                    <div class="instalment-amount-display">${formatINR(inst.amount)}</div>

                    ${!isPaid ? `
                      <button class="btn-pay-now" data-purchase-id="${inst.purchaseId}" data-inst-num="${inst.instalmentNumber}" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Pay now</span>
                      </button>
                    ` : `
                      <span class="paid-receipt-tag">
                        <span>✓ ${inst.paidOnTime ? (cycle && cycle.isQualified ? `Paid on time (Week ${inst.dueWeek} qualified ✓)` : (cycle && cycle.totalCount > 1 ? `Paid on time (${cycle.paidCount}/${cycle.totalCount} for Week ${inst.dueWeek})` : 'Paid on time ✓')) : 'Paid late'}</span>
                      </span>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </section>
    </div>
  `;
}

// ----------------------------------------------------
// SCREEN 5: LEVEL UP RENDERER (STAGE 4)
// ----------------------------------------------------
function renderLevelUp() {
  const { level, currentWeek, repaymentsCompletedAtCurrentLevel, levelUpHistory } = appState;
  const currentLevelConfig = LEVELS[level] || LEVELS[1];
  const totalLimit = getTotalLimit();
  const availableLimit = getAvailableLimit();
  const nextLvlConfig = currentLevelConfig.nextLevel ? LEVELS[currentLevelConfig.nextLevel] : null;

  const cycles = getCyclesSummary();
  const partialCycles = cycles.filter(c => c.isPartial);

  return `
    <div class="screen-view">
      <!-- Screen Header -->
      <div class="onboarding-brand" style="margin-bottom: -0.25rem;">
        <div class="brand-badge">
          <span class="brand-dot"></span>
          <span>Ascend Level Up</span>
        </div>
        <span class="pill-persona">Week ${currentWeek}</span>
      </div>

      <!-- Level Hero Card -->
      <section class="levelup-hero-card">
        <div class="levelup-hero-top">
          <div class="levelup-limit-display">
            <span class="levelup-limit-lbl">Current Credit Line</span>
            <div class="levelup-limit-amt">${formatINR(totalLimit)}</div>
            <div style="font-size:0.75rem; color:#C7D2FE; margin-top:2px;">
              Available to spend: <strong>${formatINR(availableLimit)}</strong>
            </div>
          </div>

          <div class="levelup-tier-pill">
            ★ Level ${level}: ${currentLevelConfig.name}
          </div>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.15); padding-top:0.75rem; font-size:0.74rem; color:#E0E7FF; display:flex; justify-content:space-between; align-items:center;">
          <span>On-time repayment cycles: <strong>${repaymentsCompletedAtCurrentLevel || 0}/2 completed</strong></span>
          <span>${level === 3 ? '🏆 Maximum Level Reached' : `Next Tier: ${formatINR(nextLvlConfig.limit)}`}</span>
        </div>
      </section>

      <!-- Next Level Progression Card -->
      <section class="levelup-road-card">
        ${level < 3 ? `
          <div class="section-heading" style="margin-bottom:0.15rem;">
            <h3 class="section-title">Progress to Level ${level + 1} (${nextLvlConfig.name})</h3>
            <span class="section-pill">${repaymentsCompletedAtCurrentLevel || 0}/2 Cycles</span>
          </div>

          ${partialCycles.length > 0 ? `
            <div class="cycle-progress-box" style="margin: 0.35rem 0 0.5rem 0;">
              ${partialCycles.map(c => `
                <div class="cycle-progress-pill">
                  <span>⏳ <strong>${c.progressText}</strong> (all needed for 1 ladder count)</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Stepper Graphic -->
          <div class="stepper-container" style="padding:0.75rem 0.25rem;">
            <div class="stepper-track-bg"></div>
            <div class="stepper-track-fill" style="width: ${((repaymentsCompletedAtCurrentLevel || 0) / 2) * 100}%;"></div>
            
            <div class="stepper-nodes">
              <div class="step-node ${(repaymentsCompletedAtCurrentLevel || 0) >= 1 ? 'completed' : 'current'}">
                <div class="node-circle">${(repaymentsCompletedAtCurrentLevel || 0) >= 1 ? '✓' : '1'}</div>
                <span class="node-label">Cycle 1</span>
              </div>

              <div class="step-node ${(repaymentsCompletedAtCurrentLevel || 0) >= 2 ? 'completed' : (repaymentsCompletedAtCurrentLevel || 0) === 1 ? 'current' : ''}">
                <div class="node-circle">${(repaymentsCompletedAtCurrentLevel || 0) >= 2 ? '✓' : '2'}</div>
                <span class="node-label">Cycle 2</span>
              </div>

              <div class="step-node reward">
                <div class="node-circle">★</div>
                <span class="node-label">${formatINR(nextLvlConfig.limit)}</span>
              </div>
            </div>
          </div>

          <div class="ladder-tip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--primary); flex-shrink:0; margin-top:1px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span><strong>What unlocks next:</strong> ${currentLevelConfig.nextUnlockText}</span>
          </div>
        ` : `
          <!-- Level 3 Max Perk Card -->
          <div class="level3-perk-card">
            <div style="font-size:1.5rem; flex-shrink:0;">🏆</div>
            <div>
              <strong>You've built a strong repayment record.</strong>
              <p style="margin-top:4px; font-weight:600;">Next unlock: savings-backed purchase credit.</p>
            </div>
          </div>
        `}
      </section>

      <!-- 3-Tier Roadmap Overview -->
      <section style="display:flex; flex-direction:column; gap:0.65rem;">
        <div class="section-heading">
          <h3 class="section-title">The Ascend Ladder</h3>
          <span class="section-pill">3 Tiers</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:0.55rem;">
          ${[1, 2, 3].map(lvlNum => {
            const cfg = LEVELS[lvlNum];
            const isCompleted = level > lvlNum;
            const isCurrent = level === lvlNum;

            return `
              <div class="tier-item-row ${isCurrent ? 'is-current' : ''} ${isCompleted ? 'is-completed' : ''}">
                <div class="tier-left-col">
                  <div class="tier-icon-circle">
                    ${isCompleted ? '✓' : isCurrent ? '★' : lvlNum}
                  </div>
                  <div class="tier-name-col">
                    <span class="tier-title">Level ${lvlNum}: ${cfg.name}</span>
                    <span class="tier-sub">${isCompleted ? 'Unlocked & Completed' : isCurrent ? 'Active Level' : 'Requires 2 on-time repayment cycles'}</span>
                  </div>
                </div>
                <div class="tier-limit-badge">${formatINR(cfg.limit)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- Past Level-Up History -->
      <section style="display:flex; flex-direction:column; gap:0.65rem;">
        <div class="section-heading">
          <h3 class="section-title">Level Up History (${(levelUpHistory || []).length})</h3>
          <span class="section-pill">Plain-Language Proof</span>
        </div>

        ${(!levelUpHistory || levelUpHistory.length === 0) ? `
          <div class="card-white" style="text-align:center; padding:1.4rem 1rem; color:var(--slate-500); font-size:0.8rem; line-height:1.5;">
            🌱 <strong>Starting at Level 1 Explorer (${formatINR(LEVELS[1].limit)}).</strong><br>
            Complete 2 on-time repayment cycles to earn your first limit increase to ${formatINR(LEVELS[2].limit)}.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:0.65rem;">
            ${levelUpHistory.map(evt => `
              <div class="levelup-history-item">
                <div class="levelup-history-header">
                  <span>Level ${evt.toLevel}: ${evt.toLevelName}</span>
                  <span class="levelup-history-week">Week ${evt.week}</span>
                </div>
                <div style="font-size:0.85rem; font-weight:800; color:var(--emerald);">
                  ${formatINR(evt.oldLimit)} → ${formatINR(evt.newLimit)}
                </div>
                <div class="levelup-history-reason">
                  💡 ${evt.reason}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>
    </div>
  `;
}

// ----------------------------------------------------
// CELEBRATION MODAL RENDERER
// ----------------------------------------------------
function renderCelebrationModal() {
  const { pendingCelebration } = appState;
  if (!pendingCelebration) return '';

  return `
    <div class="celebration-overlay" id="celebrationOverlay">
      <div class="celebration-modal">
        <div class="celebration-badge-icon">🎉</div>
        <div>
          <h2 class="celebration-title">Level Up Unlocked!</h2>
          <p style="font-size:0.85rem; color:var(--slate-500); margin-top:2px;">
            Welcome to <strong>Level ${pendingCelebration.toLevel} ${pendingCelebration.newLevelName}</strong>
          </p>
        </div>

        <div class="celebration-limit-jump">
          <span class="limit-old">${formatINR(pendingCelebration.oldLimit)}</span>
          <span class="limit-arrow">→</span>
          <span class="limit-new">${formatINR(pendingCelebration.newLimit)}</span>
        </div>

        <div class="celebration-reason-box">
          <strong>Why your limit increased:</strong><br>
          "${pendingCelebration.reason}"
        </div>

        <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%; margin-top:0.25rem;">
          <button id="btnViewLevelUpFromModal" class="btn-primary" type="button">
            <span>Explore Level Up Perks →</span>
          </button>
          <button id="btnDismissCelebration" class="demo-btn demo-btn-secondary" style="background:var(--slate-100); color:var(--slate-700); border-color:var(--slate-200);" type="button">
            <span>Keep Exploring</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// MASTER RENDER DISPATCHER
// ----------------------------------------------------
function renderApp() {
  const root = document.getElementById('screenRoot');
  const bottomNav = document.getElementById('bottomNav');
  const demoWeekDisplay = document.getElementById('demoWeekDisplay');
  const demoSavingsDisplay = document.getElementById('demoSavingsDisplay');
  const demoLevelDisplay = document.getElementById('demoLevelDisplay');
  const demoLimitDisplay = document.getElementById('demoLimitDisplay');
  const screenToggleLabel = document.getElementById('screenToggleLabel');

  const navBtnHome = document.getElementById('navBtnHome');
  const navBtnSpend = document.getElementById('navBtnSpend');
  const navBtnRepay = document.getElementById('navBtnRepay');
  const navBtnLevelUp = document.getElementById('navBtnLevelUp');

  if (!root) return;

  const available = getAvailableLimit();
  const total = getTotalLimit();
  const currentLevelConfig = LEVELS[appState.level] || LEVELS[1];

  // Update demo dock readouts
  if (demoWeekDisplay) demoWeekDisplay.textContent = `Week ${appState.currentWeek}`;
  if (demoSavingsDisplay) demoSavingsDisplay.textContent = `${formatINR(appState.savings.currentAmount)} / ${formatINR(appState.savings.targetAmount || 3600)}`;
  if (demoLevelDisplay) demoLevelDisplay.textContent = `L${appState.level} ${currentLevelConfig.name}`;
  if (demoLimitDisplay) demoLimitDisplay.textContent = `${formatINR(available)} / ${formatINR(total)}`;

  // Update demo dock screen switch label
  if (screenToggleLabel) {
    if (appState.currentScreen === 'onboarding') {
      screenToggleLabel.textContent = 'Go to Home';
    } else if (appState.currentScreen === 'home') {
      screenToggleLabel.textContent = 'Go to Spend';
    } else if (appState.currentScreen === 'spend') {
      screenToggleLabel.textContent = 'Go to Repay';
    } else if (appState.currentScreen === 'repay') {
      screenToggleLabel.textContent = 'Go to Level Up';
    } else {
      screenToggleLabel.textContent = 'Go to Onboard';
    }
  }

  // Update bottom navigation tabs
  if (navBtnHome && navBtnSpend && navBtnRepay && navBtnLevelUp) {
    navBtnHome.classList.toggle('active', appState.currentScreen === 'home');
    navBtnSpend.classList.toggle('active', appState.currentScreen === 'spend');
    navBtnRepay.classList.toggle('active', appState.currentScreen === 'repay');
    navBtnLevelUp.classList.toggle('active', appState.currentScreen === 'levelup');
  }

  // Render active screen
  let screenHtml = '';
  if (appState.currentScreen === 'onboarding') {
    if (bottomNav) bottomNav.classList.add('hidden');
    screenHtml = renderOnboarding();
  } else if (appState.currentScreen === 'home') {
    if (bottomNav) bottomNav.classList.remove('hidden');
    screenHtml = renderHome();
  } else if (appState.currentScreen === 'spend') {
    if (bottomNav) bottomNav.classList.remove('hidden');
    screenHtml = renderSpend();
  } else if (appState.currentScreen === 'repay') {
    if (bottomNav) bottomNav.classList.remove('hidden');
    screenHtml = renderRepay();
  } else if (appState.currentScreen === 'levelup') {
    if (bottomNav) bottomNav.classList.remove('hidden');
    screenHtml = renderLevelUp();
  }

  // Append Celebration Modal if active
  screenHtml += renderCelebrationModal();

  root.innerHTML = screenHtml;

  // Attach appropriate event listeners
  if (appState.currentScreen === 'onboarding') {
    attachOnboardingEvents();
  } else if (appState.currentScreen === 'home') {
    attachHomeEvents();
  } else if (appState.currentScreen === 'spend') {
    attachSpendEvents();
  } else if (appState.currentScreen === 'repay') {
    attachRepayEvents();
  }

  if (appState.pendingCelebration) {
    attachCelebrationEvents();
  }
}

// ----------------------------------------------------
// EVENT HANDLERS
// ----------------------------------------------------
function attachOnboardingEvents() {
  const btnConsent = document.getElementById('btnGrantConsent');
  if (btnConsent) {
    btnConsent.addEventListener('click', () => {
      appState.onboardingStep = 'verifying';
      saveState();
      renderApp();

      // Simulate swift 1.2s verification step
      setTimeout(() => {
        appState.onboardingStep = 'verified';
        saveState();
        renderApp();
      }, 1200);
    });
  }

  const btnProceed = document.getElementById('btnProceedToHome');
  if (btnProceed) {
    btnProceed.addEventListener('click', () => {
      appState.currentScreen = 'home';
      saveState();
      renderApp();
    });
  }
}

function attachHomeEvents() {
  const btnGoToSpend = document.getElementById('btnGoToSpend');
  if (btnGoToSpend) {
    btnGoToSpend.addEventListener('click', () => {
      appState.currentScreen = 'spend';
      saveState();
      renderApp();
    });
  }

  const btnGoToRepay = document.getElementById('btnGoToRepay');
  if (btnGoToRepay) {
    btnGoToRepay.addEventListener('click', () => {
      appState.currentScreen = 'repay';
      saveState();
      renderApp();
    });
  }
}

function attachSpendEvents() {
  // Purchase option buttons
  const optionCards = document.querySelectorAll('.purchase-option-card');
  optionCards.forEach(card => {
    card.addEventListener('click', () => {
      const itemId = card.getAttribute('data-item-id');
      if (itemId) {
        purchaseItem(itemId);
      }
    });
  });

  // Dismiss blocked alert
  const btnDismissAlert = document.getElementById('btnDismissAlert');
  if (btnDismissAlert) {
    btnDismissAlert.addEventListener('click', () => {
      blockedNotice = null;
      renderApp();
    });
  }
}

function attachRepayEvents() {
  // "Pay now" buttons on unpaid instalments
  const payButtons = document.querySelectorAll('.btn-pay-now');
  payButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const purchaseId = btn.getAttribute('data-purchase-id');
      const instNum = btn.getAttribute('data-inst-num');
      if (purchaseId && instNum) {
        payInstalment(purchaseId, instNum);
      }
    });
  });
}

function attachCelebrationEvents() {
  const btnView = document.getElementById('btnViewLevelUpFromModal');
  if (btnView) {
    btnView.addEventListener('click', () => {
      appState.pendingCelebration = null;
      appState.currentScreen = 'levelup';
      saveState();
      renderApp();
    });
  }

  const btnDismiss = document.getElementById('btnDismissCelebration');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      appState.pendingCelebration = null;
      saveState();
      renderApp();
    });
  }
}

function initEventBindings() {
  // Demo Controls
  const btnSkipWeek = document.getElementById('btnSkipWeek');
  if (btnSkipWeek) {
    btnSkipWeek.addEventListener('click', skipWeek);
  }

  const btnToggleScreen = document.getElementById('btnToggleScreen');
  if (btnToggleScreen) {
    btnToggleScreen.addEventListener('click', toggleScreen);
  }

  const btnResetDemo = document.getElementById('btnResetDemo');
  if (btnResetDemo) {
    btnResetDemo.addEventListener('click', resetDemoState);
  }

  // Bottom Navigation
  const navBtnHome = document.getElementById('navBtnHome');
  if (navBtnHome) {
    navBtnHome.addEventListener('click', () => {
      appState.currentScreen = 'home';
      saveState();
      renderApp();
    });
  }

  const navBtnSpend = document.getElementById('navBtnSpend');
  if (navBtnSpend) {
    navBtnSpend.addEventListener('click', () => {
      appState.currentScreen = 'spend';
      saveState();
      renderApp();
    });
  }

  const navBtnRepay = document.getElementById('navBtnRepay');
  if (navBtnRepay) {
    navBtnRepay.addEventListener('click', () => {
      appState.currentScreen = 'repay';
      saveState();
      renderApp();
    });
  }

  const navBtnLevelUp = document.getElementById('navBtnLevelUp');
  if (navBtnLevelUp) {
    navBtnLevelUp.addEventListener('click', () => {
      appState.currentScreen = 'levelup';
      saveState();
      renderApp();
    });
  }

  // Real-time mobile clock updater
  updateClock();
  setInterval(updateClock, 30000);
}

function updateClock() {
  const clockEl = document.getElementById('statusClock');
  if (clockEl) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}`;
  }
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initEventBindings();
  renderApp();
});
