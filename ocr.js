// Vercel 서버리스 함수: 영상 캡처 이미지에서 자막(중국어)만 Gemini가 읽어 줍니다.
// Vercel 환경변수: GEMINI_API_KEY (필수), ACCESS_CODE (권장), GEMINI_MODEL (선택)
const SYSTEM = `너는 영상 화면 캡처에서 자막을 읽어 옮기는 OCR 도우미다.
1) 화면에 입혀진 영상 자막(대사) 중 중국어 문장만 보이는 그대로 옮겨 적는다. 번체/간체를 바꾸지 않는다.
2) 병음, 한국어·영어 번역 자막, 앱 버튼과 메뉴, 시간 표시, 로고, 워터마크, 채널명, 배경 간판 글자는 제외한다.
3) 자막이 여러 줄이면 보이는 순서대로 줄을 나눈다. 글자 사이에 공백을 넣지 않는다.
4) 읽을 수 없는 글자를 지어내지 않는다. 중국어 자막이 없으면 빈 배열을 돌려준다.
반드시 아래 JSON만 출력한다. 설명이나 코드블록은 쓰지 않는다.
{"lines":["자막 한 줄", "자막 한 줄"]}`;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 지원합니다." });
  const code = process.env.ACCESS_CODE;
  if (code && req.headers["x-access-code"] !== code) return res.status(401).json({ error: "접근 코드가 올바르지 않습니다." });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." });
  const body = req.body || {};
  const image = String(body.image || "");
  const mime = ["image/jpeg", "image/png", "image/webp"].includes(body.mime) ? body.mime : "image/jpeg";
  if (!image) return res.status(400).json({ error: "이미지가 비어 있습니다." });
  if (image.length > 3500000) return res.status(413).json({ error: "이미지가 너무 큽니다. 자막 부분만 선택해 다시 시도하세요." });
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: image } }, { text: "이 화면의 중국어 자막만 읽어 주세요." }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 800 },
      }),
    });
    const j = await r.json();
    if (r.status === 429) return res.status(429).json({ error: "무료 사용 한도에 도달했습니다. 잠시 후 다시 시도하세요." });
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || "AI 호출에 실패했습니다." });
    const out = ((j.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const data = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
    const lines = (Array.isArray(data.lines) ? data.lines : []).map((l) => String(l).trim()).filter(Boolean).slice(0, 8);
    res.status(200).json({ lines });
  } catch (e) {
    res.status(500).json({ error: "AI 응답을 처리하지 못했습니다." });
  }
};
