import { weekRange, weeklyHealth, weeklyInvestments } from '../shared/weekly';
import type { WeeklySummary } from '../shared/models';
import type { HealthRepository } from './health';
import type { FinanceRepository } from './finance';
import type { InvestmentRepository } from './investments';

export class WeeklySummaryService {
  constructor(private health:HealthRepository,private finance:FinanceRepository,private investments:InvestmentRepository){}
  get(period:'current'|'previous'):WeeklySummary {
    const {start,end}=weekRange(period);
    return {start,end,health:weeklyHealth(this.health.list(),start,end),finance:this.finance.periodSummary(start,end),investments:weeklyInvestments(this.investments.list(),start,end)};
  }
}
