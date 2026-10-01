export const wellbeingOptions = {
  mood: [[1,'Очень тяжело'],[3,'Плохо'],[5,'Нейтрально'],[7,'Хорошо'],[10,'Отлично']],
  energy: [[1,'Сил совсем нет'],[3,'Мало сил'],[5,'Хватает на обычные дела'],[7,'Есть запас сил'],[10,'Много сил']]
} as const;

export function wellbeingLabel(kind:keyof typeof wellbeingOptions,value:number):string {
  const options=wellbeingOptions[kind];
  return options.reduce((closest,item)=>Math.abs(item[0]-value)<Math.abs(closest[0]-value)?item:closest,options[0])[1];
}

// Numeric values are storage codes; the user describes their day in ordinary words.
export const wellbeingInstructions = `Настроение и энергию пользователь описывает словами, числовые оценки от него не нужны. Сам сопоставь прямое описание с вариантами приложения и верни соответствующий внутренний код в JSON.
Настроение (mood) — общая эмоциональная оценка дня: ${wellbeingOptions.mood.map(([code,label])=>`${code} = «${label}»`).join('; ')}.
Энергия (energy) — запас сил для дел: ${wellbeingOptions.energy.map(([code,label])=>`${code} = «${label}»`).join('; ')}.
Примеры: «День прошёл хорошо, но сил почти не было» => mood=7, energy=3; «Настроение отличное, сил полно» => mood=10, energy=10; «Еле справлялся, сил совсем не было» => mood=null, energy=1; «День обычный, на дела сил хватало» => mood=5, energy=5; «Настроение было плохое» => mood=3, energy=null.
Настроение и энергия независимы: усталость сама по себе не означает плохого настроения, хорошее настроение не означает много сил. Учитывай отрицания: «не было сил» — низкая энергия, а не высокая. Не выводи самочувствие из трат, привычек, тренировок или длительности сна. Если соответствующее самочувствие не описано, верни null. Не проси пользователя перевести слова в цифры и не добавляй такое требование в uncertain. В summary описывай самочувствие словами, без внутренних числовых кодов.`;
