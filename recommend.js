// Vercel 서버리스 함수: OCR로 추출한 중국어 자막을 Gemini가 다시 보고 공부할 단어를 추천합니다.
// Vercel 환경변수: GEMINI_API_KEY (필수, Google AI Studio 무료 키), ACCESS_CODE (권장), GEMINI_MODEL (선택)
const SYSTEM = `너는 한국어 사용자를 위한 중국어 학습 도우미다.
입력은 영상 자막을 OCR로 읽은 중국어 문장이며 오인식된 글자가 있을 수 있다.
1) 문맥상 분명한 OCR 오류만 고쳐 corrected에 담는다. 번체/간체는 입력 그대로 유지한다.
2) 학습할 가치가 있는 단어나 표현을 최대 8개 고른다. 我, 的, 是 같은 아주 기초적인 단어는 제외한다.
3) 병음은 성조 부호가 있는 표준 한어병음으로, 뜻은 한국어로, reason은 이 문장에서 왜 유용한지 한 줄로 쓴다.
반드시 아래 JSON만 출력한다. 설명이나 코드블록은 쓰지 않는다.
{"corrected":"문장","words":[{"word":"","pinyin":"","meaning":"","reason":"","level":"초급|중급|고급"}]}`;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 지원합니다." });
  const code = process.env.ACCESS_CODE;
  if (code && req.headers["x-access-code"] !== code) return res.status(401).json({ error: "접근 코드가 올바르지 않습니다." });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." });
  const text = String((req.body && req.body.text) || "").trim().slice(0, 1500);
  if (!text) return res.status(400).json({ error: "텍스트가 비어 있습니다." });
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 1500 },
      }),
    });
    const j = await r.json();
    if (r.status === 429) return res.status(429).json({ error: "무료 사용 한도에 도달했습니다. 잠시 후 다시 시도하세요." });
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || "AI 호출에 실패했습니다." });
    const out = ((j.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const data = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
    res.status(200).json({ corrected: data.corrected || text, words: (data.words || []).slice(0, 10) });
  } catch (e) {
    res.status(500).json({ error: "AI 응답을 처리하지 못했습니다." });
  }
};
