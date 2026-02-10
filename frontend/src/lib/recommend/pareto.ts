export type ObjectiveDirection = "min" | "max";

export type ObjectiveSpec<T> = {
  key: string;
  direction: ObjectiveDirection;
  getValue: (row: T) => number;
};

const EPS = 1e-9;

function isNoWorse(a: number, b: number, direction: ObjectiveDirection): boolean {
  if (direction === "min") return a <= b + EPS;
  return a >= b - EPS;
}

function isStrictlyBetter(a: number, b: number, direction: ObjectiveDirection): boolean {
  if (direction === "min") return a < b - EPS;
  return a > b + EPS;
}

export function dominates<T>(candidate: T, target: T, objectives: Array<ObjectiveSpec<T>>): boolean {
  let strictlyBetter = false;

  for (const objective of objectives) {
    const candidateValue = objective.getValue(candidate);
    const targetValue = objective.getValue(target);

    if (!isNoWorse(candidateValue, targetValue, objective.direction)) {
      return false;
    }
    if (isStrictlyBetter(candidateValue, targetValue, objective.direction)) {
      strictlyBetter = true;
    }
  }

  return strictlyBetter;
}

export function paretoFront<T>(rows: T[], objectives: Array<ObjectiveSpec<T>>): T[] {
  const front: T[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    let dominated = false;
    for (let j = 0; j < rows.length; j += 1) {
      if (i === j) continue;
      if (dominates(rows[j], rows[i], objectives)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) front.push(rows[i]);
  }

  return front;
}
