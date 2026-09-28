/**
 * Digital Twin Physics & Transfer Function Engine
 * Computes microclimate transit drag, topological DAG buffer consumption, and resilience scoring
 */

const SENSITIVITY_MATRIX = {
  flight: { rainThreshold: 15, rainCoeff: 1.2, windThreshold: 35, windCoeff: 1.8, visThreshold: 1.5, visCoeff: 25, maxHold: 240 },
  train: { rainThreshold: 25, rainCoeff: 0.9, windThreshold: 60, windCoeff: 1.2, visThreshold: 0.5, visCoeff: 10, maxHold: 180 },
  bus: { rainThreshold: 12, rainCoeff: 1.4, windThreshold: 50, windCoeff: 0.8, visThreshold: 1.2, visCoeff: 20, maxHold: 210 },
  transfer: { rainThreshold: 10, rainCoeff: 1.5, windThreshold: 45, windCoeff: 0.7, visThreshold: 1.0, visCoeff: 18, maxHold: 150 },
  activity: { rainThreshold: 8, rainCoeff: 2.0, windThreshold: 30, windCoeff: 1.5, visThreshold: 2.0, visCoeff: 15, maxHold: 180 },
  hotel: { rainThreshold: 40, rainCoeff: 0.2, windThreshold: 90, windCoeff: 0.1, visThreshold: 0.2, visCoeff: 5, maxHold: 60 },
};

/**
 * Calculate delay drag for a specific booking node given weather parameters
 */
export function calculateNodeDelay(type, weather) {
  const params = SENSITIVITY_MATRIX[type] || SENSITIVITY_MATRIX.activity;
  const { rainfall = 0, windSpeed = 0, visibility = 10 } = weather;

  const rainExcess = Math.max(0, rainfall - params.rainThreshold);
  const windExcess = Math.max(0, windSpeed - params.windThreshold);
  const visDeficit = Math.max(0, params.visThreshold - visibility);

  const delay = (rainExcess * params.rainCoeff) + (windExcess * params.windCoeff) + (visDeficit * params.visCoeff);
  return Math.min(params.maxHold, Math.round(delay));
}

/**
 * Run Digital Twin counterfactual simulation across itinerary bookings
 */
export function runDigitalTwinSimulation(bookings = [], weatherScenario = {}) {
  const { rainfall = 0, windSpeed = 0, visibility = 10, timeOffset = 0 } = weatherScenario;

  let totalDelay = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let accumulatedCascadeDelay = 0;

  const evaluatedNodes = bookings.map((b, idx) => {
    const rawDelay = calculateNodeDelay(b.type, weatherScenario);
    const connectionBuffer = b.buffer_minutes || 60;
    
    // Accumulate cascade drag across consecutive nodes
    const totalNodeDelay = rawDelay + (accumulatedCascadeDelay > 0 ? Math.round(accumulatedCascadeDelay * 0.5) : 0);
    const bufferRemaining = connectionBuffer - totalNodeDelay;

    let status = 'normal';
    let failureProbability = 0.05;

    if (bufferRemaining < 0) {
      status = 'critical';
      criticalCount++;
      failureProbability = Math.min(0.98, Number((0.65 + (Math.abs(bufferRemaining) / 100)).toFixed(2)));
      accumulatedCascadeDelay = Math.abs(bufferRemaining);
    } else if (bufferRemaining < 20 || totalNodeDelay > 30) {
      status = 'warning';
      warningCount++;
      failureProbability = Math.min(0.60, Number((0.25 + (totalNodeDelay / 150)).toFixed(2)));
      accumulatedCascadeDelay = 5;
    } else {
      accumulatedCascadeDelay = 0;
    }

    totalDelay += totalNodeDelay;

    return {
      ...b,
      simulatedDelay: totalNodeDelay,
      bufferRemaining,
      connectionBuffer,
      status,
      failureProbability,
      impactReason: status === 'critical'
        ? `Exceeds ${connectionBuffer}m connection buffer by ${Math.abs(bufferRemaining)}m. Topological cascade triggered.`
        : status === 'warning'
        ? `Safety buffer strained (${bufferRemaining}m left). High risk of missed transfer.`
        : `Operating within safety buffer (${bufferRemaining}m margin).`,
    };
  });

  // Calculate dynamic resilience score (15 to 100)
  const rawScore = 100 - (criticalCount * 22) - (warningCount * 9);
  const resilienceScore = Math.max(15, Math.min(100, Math.round(rawScore)));

  // Generate proactive mitigation advice
  let proactiveAdvice = 'Optimal buffer elasticity across all route nodes. No action required.';
  if (criticalCount > 0) {
    proactiveAdvice = `Pre-emptively trigger Plan B: Switch transit transfer for node ${evaluatedNodes.find(n => n.status === 'critical')?.title || 'disrupted booking'} to high-frequency subway line and request early check-in window.`;
  } else if (warningCount > 0) {
    proactiveAdvice = 'Elevated weather friction detected. Consider extending transfer buffer by +30 min or pre-booking flexible express rides.';
  }

  return {
    timestamp: new Date().toISOString(),
    resilienceScore,
    totalDelay,
    criticalCount,
    warningCount,
    evaluatedNodes,
    proactiveAdvice,
    weatherScenario,
  };
}
