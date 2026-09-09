/**
 * Debt Simplification Algorithm
 *
 * Given net balances for all trip members, computes the minimum number
 * of transactions needed to settle all debts.
 * Uses a greedy approach: match largest creditor with largest debtor.
 */

/**
 * @param {Array} balances - [{ userId, name, netBalance }]
 *   netBalance > 0 means others owe this person
 *   netBalance < 0 means this person owes others
 * @returns {Array} - [{ from, fromName, to, toName, amount }]
 */
export function simplifyDebts(balances) {
  const creditors = []; // positive balance
  const debtors = [];   // negative balance

  for (const b of balances) {
    if (b.netBalance > 0.01) {
      creditors.push({ ...b, remaining: b.netBalance });
    } else if (b.netBalance < -0.01) {
      debtors.push({ ...b, remaining: Math.abs(b.netBalance) });
    }
  }

  // Sort descending by amount
  creditors.sort((a, b) => b.remaining - a.remaining);
  debtors.sort((a, b) => b.remaining - a.remaining);

  const transactions = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const amount = Math.min(creditors[i].remaining, debtors[j].remaining);

    if (amount > 0.01) {
      transactions.push({
        from: debtors[j].userId,
        fromName: debtors[j].name,
        to: creditors[i].userId,
        toName: creditors[i].name,
        amount: Math.round(amount * 100) / 100,
      });
    }

    creditors[i].remaining -= amount;
    debtors[j].remaining -= amount;

    if (creditors[i].remaining < 0.01) i++;
    if (debtors[j].remaining < 0.01) j++;
  }

  return transactions;
}

/**
 * Calculate net balances for all members from expenses and expense_shares.
 *
 * @param {Array} members - trip members with { id, full_name }
 * @param {Array} expenses - all trip expenses with { id, paid_by, amount }
 * @param {Array} expenseShares - all expense_shares with { expense_id, user_id, share_amount }
 * @returns {Array} - [{ userId, name, totalPaid, totalShare, netBalance }]
 */
export function calculateBalances(members, expenses, expenseShares) {
  const balanceMap = {};

  for (const member of members) {
    balanceMap[member.id] = {
      userId: member.id,
      name: member.full_name || member.email,
      totalPaid: 0,
      totalShare: 0,
      netBalance: 0,
    };
  }

  // Sum what each person paid
  for (const expense of expenses) {
    if (balanceMap[expense.paid_by]) {
      balanceMap[expense.paid_by].totalPaid += Number(expense.amount);
    }
  }

  // Sum each person's share
  for (const share of expenseShares) {
    if (balanceMap[share.user_id]) {
      balanceMap[share.user_id].totalShare += Number(share.share_amount);
    }
  }

  // Net = paid - share (positive: others owe you; negative: you owe others)
  for (const key of Object.keys(balanceMap)) {
    balanceMap[key].netBalance =
      Math.round((balanceMap[key].totalPaid - balanceMap[key].totalShare) * 100) / 100;
  }

  return Object.values(balanceMap);
}

/**
 * Calculate expense shares for a given split type.
 *
 * @param {number} amount - total expense amount
 * @param {Array} participants - [{ userId }]
 * @param {string} splitType - 'equal' | 'percentage' | 'custom' | 'full'
 * @param {Array} customSplits - [{ userId, value }] (for percentage/custom)
 * @param {string} paidBy - userId of payer (for 'full' type)
 * @returns {Array} - [{ userId, shareAmount }]
 */
export function calculateShares(amount, participants, splitType, customSplits = [], paidBy = null) {
  switch (splitType) {
    case 'equal': {
      const count = participants.length;
      if (count === 0) return [];
      const share = Math.round((amount / count) * 100) / 100;
      // Handle rounding: last person gets remainder
      const shares = participants.map((p, i) => ({
        userId: p.userId,
        shareAmount: i === count - 1
          ? Math.round((amount - share * (count - 1)) * 100) / 100
          : share,
      }));
      return shares;
    }

    case 'percentage': {
      return participants.map(p => {
        const split = customSplits.find(s => s.userId === p.userId);
        const pct = split ? split.value : 0;
        return {
          userId: p.userId,
          shareAmount: Math.round((amount * pct / 100) * 100) / 100,
        };
      });
    }

    case 'custom': {
      return participants.map(p => {
        const split = customSplits.find(s => s.userId === p.userId);
        return {
          userId: p.userId,
          shareAmount: split ? Number(split.value) : 0,
        };
      });
    }

    case 'full': {
      // Only the payer owns the expense; no one else owes anything
      return paidBy ? [{ userId: paidBy, shareAmount: amount }] : [];
    }

    default:
      return [];
  }
}
