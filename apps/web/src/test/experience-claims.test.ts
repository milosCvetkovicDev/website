/**
 * The check the years-of-experience tests share (`experience-claims.ts`), proved on the sentences it
 * has to tell apart: the copy the site shipped before #49, the copy it ships now, and the rewordings
 * a looser check let through.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { yearsClauses, yearsClausesAboutAi, yearsFigures } from './experience-claims';

describe('yearsFigures', () => {
  it('reads every count of years, with or without a plus', () => {
    expect(yearsFigures('13 years · 6 domains · 3 clouds')).toEqual([13]);
    expect(yearsFigures('10+ years rescuing code, then 2 yrs of AI')).toEqual([10, 2]);
    expect(yearsFigures('Shipping code since 2013')).toEqual([]);
  });
});

describe('yearsClausesAboutAi', () => {
  it('passes the copy the site ships', () => {
    for (const text of [
      'Senior Full-Stack Engineer with 13 years of experience in software engineering, now building AI-native systems.',
      'Senior Full Stack Engineer & Architect with 13 years of experience in software engineering, now building AI-native systems, self-healing agents, and cloud-native architecture.',
      'I fix the systems everyone else gave up on: 13 years rescuing legacy codebases, now building AI agents that fix their own bugs. Based in Belgrade.',
    ]) {
      expect(yearsClauses(text)).toHaveLength(1);
      expect(yearsClausesAboutAi(text)).toEqual([]);
    }
  });

  it('flags a clause that ties the total to AI work, wherever the AI word sits', () => {
    for (const text of [
      // What the Person description said before #49.
      'Senior Full Stack Engineer & Architect with 13 years of experience building AI-native systems, self-healing agents, and cloud-native architecture.',
      'AI-native engineer with 13 years in production.',
      '13 years of LLM work.',
      'Thirteen roles and 13 years building agentic systems.',
      '13 years in machine-learning platforms.',
    ]) {
      expect(yearsClausesAboutAi(text), text).toHaveLength(1);
    }
  });
});
