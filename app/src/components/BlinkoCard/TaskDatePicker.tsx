import {DatePicker} from '@heroui/react';
import {parseDate} from '@internationalized/date';
/** HeroUI date picker, date-only local calendar semantics. */
export function TaskDatePicker({label,value,onChange}:{label:string;value?:string;onChange:(value:string|undefined)=>void}){
 let date:ReturnType<typeof parseDate>|null=null;try{if(value)date=parseDate(value);}catch{}
 return <DatePicker aria-label={label} label={label} labelPlacement="outside" size="sm" value={date as any} onChange={next=>onChange(next?.toString())} showMonthAndYearPickers popoverProps={{disableAnimation:true,style:{zIndex:10080},classNames:{content:'!z-[10080]'}}} classNames={{inputWrapper:'bg-default-100 shadow-none'}}/>;
}
