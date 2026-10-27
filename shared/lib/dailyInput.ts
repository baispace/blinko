const yesterdayLabel = '昨日事项与进展：';
const todayLabel = '今日安排：';
export function splitDailyInput(input: string) {
  const marker = input.indexOf('\n' + todayLabel);
  return marker < 0 ? { yesterday: input.replace(/^昨日事项与进展：\n?/, ''), today: '' } : {
    yesterday: input.slice(0, marker).replace(/^昨日事项与进展：\n?/, ''),
    today: input.slice(marker + todayLabel.length + 1).replace(/^\n/, ''),
  };
}
export function joinDailyInput(yesterday: string, today: string) {
  return yesterday.trim() || today.trim() ? `${yesterdayLabel}\n${yesterday}\n${todayLabel}\n${today}` : '';
}
