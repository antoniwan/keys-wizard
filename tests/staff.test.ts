import { describe, expect, it } from 'vitest';
import { isSharp, ledgerSteps, staffStep } from '../src/view/staff';

describe('staff positions', () => {
  it('counts lines and spaces from middle C', () => {
    expect(staffStep(60)).toBe(0); // C4, the ledger line between the staves
    expect(staffStep(64)).toBe(2); // E4, bottom treble line
    expect(staffStep(77)).toBe(10); // F5, top treble line
    expect(staffStep(57)).toBe(-2); // A3, top bass line
    expect(staffStep(43)).toBe(-10); // G2, bottom bass line
    expect(staffStep(84)).toBe(14); // C6
    expect(staffStep(36)).toBe(-14); // C2
  });

  it('puts a sharp on the line of its natural', () => {
    expect(staffStep(66)).toBe(staffStep(65)); // F sharp sits where F does
    expect(isSharp(66)).toBe(true);
    expect(isSharp(65)).toBe(false);
  });

  it('adds ledger lines only outside the staves', () => {
    expect(ledgerSteps(0)).toEqual([0]); // middle C
    expect(ledgerSteps(6)).toEqual([]); // B4, inside the treble staff
    expect(ledgerSteps(1)).toEqual([]); // D4 hangs below the treble staff
    expect(ledgerSteps(12)).toEqual([12]); // A5
    expect(ledgerSteps(14)).toEqual([12, 14]); // C6
    expect(ledgerSteps(-13)).toEqual([-12]); // D2 sits under the first ledger line
  });
});
