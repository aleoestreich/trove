import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { formatMoney, formatPercent, formatWholeMoney, signOf } from '../../lib/money'
import { owedByPerson, owedTotal } from '../../data/receivables'
import { Card } from '../ui'
import { Icon } from '../Icon'
import { CategoryBadge } from '../CategoryBadge'
import { AlertBadge } from '../insights/parts'
import { useAlertText } from '../insights/recurringParts'
import { CardHeader, RowIcon, RowLink, RowValue, TextLink } from './parts'

/** At most this many of each kind on the card; the pages have the rest. */
const PER_KIND = 3

/**
 * Alertas: what asks for attention, in one list. Unusual categories against
 * their own average (left out while the Fechamento do mês shows the same
 * month), recurring charges to review (a price increase, a new one, one
 * that stopped), and what others owe ("A receber"). Each row opens its
 * page; links below lead to Fora do padrão and Recorrentes. With nothing to
 * flag, it says so.
 */
export function AlertsCard({ closeShown, className = '' }: { closeShown: boolean; className?: string }) {
  const { insights, categoriesById, receivables } = useData()
  const { t, categoryName } = useI18n()
  const a = t.overview.alerts
  const alertText = useAlertText()
  const unusual = insights.unusual && !(closeShown && insights.unusual.mode === 'month') ? insights.unusual.unusual.slice(0, PER_KIND) : []
  const recurring = insights.recurring
  const items = new Map([...recurring.active, ...recurring.stopped].map((i) => [i.id, i]))
  const recurringAlerts = recurring.alerts.slice(0, PER_KIND).filter((x) => items.has(x.recurringId))
  const owed = owedTotal(receivables)
  const people = owedByPerson(receivables).length
  const count = unusual.length + recurringAlerts.length + (owed > 0 ? 1 : 0)

  return (
    <Card className={`flex flex-col gap-1 ${className}`}>
      <CardHeader
        title={a.title}
        subtitle={count ? `${a.sub} · ${a.count(count)}` : a.sub}
      />
      {count === 0 ? (
        <p className="mt-2 flex items-center gap-2 rounded-md bg-page px-3 py-2.5 text-sm leading-5 text-ink">
          <Icon name="check" className="size-[18px] shrink-0 text-income" strokeWidth={2.2} />
          {a.none}
        </p>
      ) : (
        <div className="mt-1 flex flex-col divide-y divide-line lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0 lg:[&>*]:border-b lg:[&>*]:border-line">
          {unusual.map((c) => {
            const up = c.delta > 0
            const name = categoryName(categoriesById.get(c.categoryId))
            return (
              <RowLink
                key={`u-${c.categoryId}`}
                to={`/insights/unusual/${c.categoryId}`}
                lead={<CategoryBadge category={categoriesById.get(c.categoryId)} size={32} />}
                title={name}
                sub={a.unusual(formatPercent(Math.abs(Math.round(c.pct * 100))), up, formatWholeMoney(c.avg))}
                trail={<RowValue tone={up ? 'text-critical' : 'text-income'}>{`${signOf(c.delta)}${formatWholeMoney(Math.abs(c.delta))}`}</RowValue>}
              />
            )
          })}
          {recurringAlerts.map((x) => {
            const item = items.get(x.recurringId)!
            return (
              <RowLink
                key={`r-${x.type}-${x.recurringId}`}
                to="/recurring"
                lead={<CategoryBadge category={item.categoryId ? categoriesById.get(item.categoryId) : null} size={32} />}
                title={item.merchant}
                sub={alertText(x, item)}
                trail={<AlertBadge kind={x.type} small />}
              />
            )
          })}
          {owed > 0 && (
            <RowLink to="/receivables" lead={<RowIcon icon="piggy" />} title={a.owedTitle} sub={a.owed(people)} trail={<RowValue>{formatMoney(owed)}</RowValue>} />
          )}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4">
        {insights.unusual && <TextLink to="/insights/unusual">{a.seeUnusual}</TextLink>}
        <TextLink to="/recurring">{a.seeRecurring}</TextLink>
      </div>
    </Card>
  )
}
