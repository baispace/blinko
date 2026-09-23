import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import isoWeek from 'dayjs/plugin/isoWeek';
import('dayjs/locale/en') 
import('dayjs/locale/zh') 

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
// 提供 isoWeek() 及格式符 W / WW（按周分组等场景依赖）
dayjs.extend(isoWeek);

export default dayjs;
