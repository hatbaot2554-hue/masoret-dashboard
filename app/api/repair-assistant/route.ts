import { NextResponse } from 'next/server';
import { clientIp, isDashboardRequest, rateLimit } from '../../lib/security';

type AssistantImage = {
  name?: string;
  type?: string;
  dataUrl?: string;
};

type OpenAIContentPart = {
  text?: string;
};

type OpenAIOutputItem = {
  content?: OpenAIContentPart[];
};

type OpenAIResponseShape = {
  output_text?: string;
  output?: OpenAIOutputItem[];
};

type OpenAIInputPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string };

function fallbackAnswer(question: string, context: Record<string, unknown>) {
  const text = [
    question,
    context?.title,
    context?.description,
    context?.recommendedAction,
    context?.secret,
  ]
    .filter(Boolean)
    .join(' ');

  const secret = String(context?.secret || '').trim();
  if (secret) {
    return [
      `הבעיה המרכזית היא שחסר משתנה חיצוני בשם ${secret}.`,
      'המערכת לא יכולה ליצור את הערך הזה בעצמה, כי זה מפתח גישה שנוצר בחשבון החיצוני שלך.',
      'מה לעשות עכשיו:',
      '1. לפתוח את השירות שממנו מגיע המפתח.',
      '2. ליצור מפתח חדש עם הרשאות מינימליות, עדיף קריאה/ניטור בלבד כשאפשר.',
      '3. להיכנס ל-Vercel > הפרויקט masoret-dashboard > Settings > Environment Variables.',
      `4. להוסיף משתנה בשם ${secret} ולהדביק את הערך בלי לשלוח אותו בצ׳אט.`,
      '5. לבצע Redeploy לפריסה האחרונה.',
      '6. לחזור לבריאות האתר וללחוץ רענון נתונים.',
      'אם העלית תמונה, בדוק שהמסך בתמונה הוא באמת מקום יצירת הטוקן או הגדרת Environment Variables.',
    ].join('\n');
  }

  if (/vercel/i.test(text)) {
    return 'נראה שהשאלה קשורה ל-Vercel. בדרך כלל צריך לבדוק את הפריסה האחרונה, Environment Variables, ולבצע Redeploy אחרי שינוי סודות. אם תעלה צילום מסך של השגיאה או של עמוד ההגדרות, אוכל לכוון אותך לשדה המדויק.';
  }

  if (/aiven|database|db|מסד/i.test(text)) {
    return 'נראה שהשאלה קשורה למסד הנתונים או Aiven. צריך לבדוק שהשירות פעיל, שיש גיבויים, שאין עומס חריג, וש-DATABASE_URL בלוח הבקרה עדיין מצביע למסד הפעיל. אל תשלח כאן את כתובת החיבור המלאה או סיסמה.';
  }

  return 'אני יכול לעזור כאן צעד-אחר-צעד. כתוב מה אתה רואה במסך או העלה צילום מסך, ואני אסביר מה לבדוק, במה לא לגעת, ומה הצעד הבא הבטוח.';
}

function textFromOpenAI(data: OpenAIResponseShape | null) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  const parts: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.text) parts.push(String(content.text));
    }
  }
  return parts.join('\n').trim();
}

export async function POST(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }
    if (!rateLimit(`repair-assistant:${clientIp(request)}`, 30, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'יותר מדי שאלות בזמן קצר. נסה שוב בעוד כמה דקות.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({})) as {
      question?: string;
      context?: Record<string, unknown>;
      images?: AssistantImage[];
    };
    const question = String(body.question || '').trim();
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];

    if (!question && images.length === 0) {
      return NextResponse.json({ error: 'כתוב שאלה או צרף תמונה.' }, { status: 400 });
    }

    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    if (!openAiKey) {
      return NextResponse.json({ answer: fallbackAnswer(question, context), mode: 'guided-fallback' });
    }

    const content: OpenAIInputPart[] = [
      {
        type: 'input_text',
        text: JSON.stringify({
          instruction:
            'ענה בעברית פשוטה, מפורטת ומעשית. אל תבקש מהמשתמש לשלוח סודות. אם חסר מפתח או הרשאה, הסבר איך ליצור ולהגדיר אותו צעד אחר צעד. אם אפשר לתקן אוטומטית, הסבר מה המערכת תעשה ומה ידרוש אישור.',
          question,
          context,
        }),
      },
    ];

    for (const image of images) {
      if (image?.dataUrl && /^data:image\/(png|jpe?g|webp);base64,/i.test(image.dataUrl)) {
        content.push({ type: 'input_image', image_url: image.dataUrl });
      }
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${openAiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_REPAIR_ASSISTANT_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: 'אתה עוזר תיקונים בתוך לוח בקרה של אתר מסחר. עזור למנהל לפתור בעיות בזמן אמת. אל תחשוף או תבקש סודות. אל תגיד שביצעת פעולה אם רק נתת הנחיה.',
              },
            ],
          },
          { role: 'user', content },
        ],
        max_output_tokens: 1200,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.error?.message || `OpenAI החזיר ${response.status}`;
      return NextResponse.json({ answer: `${fallbackAnswer(question, context)}\n\nהערה: מנוע AI לא ענה כרגע: ${detail}`, mode: 'guided-fallback' });
    }

    return NextResponse.json({ answer: textFromOpenAI(data) || fallbackAnswer(question, context), mode: 'ai' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'שגיאת שרת' }, { status: 500 });
  }
}
