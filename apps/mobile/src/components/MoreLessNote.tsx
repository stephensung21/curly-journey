import { Amount } from './Amount';
import { HandNote } from './doodles/HandNote';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prevMonthShort(month: string): string {
  const m = Number(month.slice(5, 7));
  return MONTHS[(m + 10) % 12]!;
}

/** "$X more/less than <prev month>"; nothing when there is no previous spending or no change. */
export function MoreLessNote({ month, totalCents, prevTotalCents }: { month: string; totalCents: number; prevTotalCents: number }) {
  const diff = totalCents - prevTotalCents;
  if (prevTotalCents <= 0 || diff === 0) return null;
  return (
    <HandNote tone={diff > 0 ? 'pink' : 'lime'}>
      <Amount cents={Math.abs(diff)} decimals="never" inline /> {diff > 0 ? 'more' : 'less'} than {prevMonthShort(month)}
    </HandNote>
  );
}
