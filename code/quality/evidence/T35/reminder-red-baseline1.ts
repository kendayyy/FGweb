/** T35 RED baseline: no scheduled reminder producer yet. */
export class ScheduleReminders {
 constructor(private readonly databaseURL:string){}
 async scan(){return 0;} async close(){}
}
