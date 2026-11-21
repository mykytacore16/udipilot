export default function OSystemie({ status }) {
  const llm = status?.llm;
  return (
    <div style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div><h1>Bezpieczeństwo i AI</h1><p>Jak UDIPilot chroni dane i jak działa w zamkniętej sieci Urzędu.</p></div>
        <button className="btn" onClick={async () => {
          if (!confirm('Przywrócić dane demonstracyjne? Wszystkie bieżące wnioski i dokumenty zostaną zastąpione danymi testowymi.')) return;
          await fetch('/api/demo/reset', { method: 'POST' });
          window.location.hash = '#/';
        }}>↺ Przywróć dane demo</button>
      </div>
      <div className="grid-2">
        <div className="card card-pad stack">
          <h2>Tryb pracy</h2>
          <div className={`alert ${llm?.enabled && !llm.local ? 'warn' : 'ok'}`}>
            {llm?.enabled
              ? <>Model językowy: <b>{llm.model}</b> ({llm.local ? 'lokalny' : 'zewnętrzny – tylko na potrzeby demo na danych testowych'})<br /><span className="mono small">{llm.baseUrl}</span></>
              : <>Pracuje <b>w 100% offline</b>: reguły, wyszukiwanie BM25 i słowniki działają lokalnie. Żadne dane nie opuszczają serwera.</>}
          </div>
          <p className="small muted">Model ustawia się jedną zmienną w pliku <span className="mono">.env</span> (interfejs zgodny z OpenAI: Ollama, vLLM, LM Studio). Zmiana modelu nie wymaga zmian w kodzie.</p>
          <h3>Rekomendowane modele lokalne</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li><b>Bielik 11B v2 Instruct</b> (SpeakLeash, polski model open-source) – przez Ollama / vLLM, 1 serwer z GPU 24 GB (lub mniej w kwantyzacji).</li>
            <li><b>PLLuM</b> – polski model językowy rozwijany na potrzeby administracji publicznej.</li>
            <li>Bez GPU: Bielik 4.5B / 1.5B w kwantyzacji Q4 na CPU – wolniej, ale wystarczająco do redakcji akapitów.</li>
          </ul>
        </div>
        <div className="card card-pad stack">
          <h2>Gdzie jest AI, a gdzie reguły</h2>
          <table className="t">
            <tbody>
              <tr><td>Termin, święta, kwerenda</td><td><span className="badge green">reguły</span> art. 13 u.d.i.p., art. 57 KPA</td></tr>
              <tr><td>Podobne sprawy</td><td><span className="badge green">lokalnie</span> wyszukiwanie BM25 + archiwum</td></tr>
              <tr><td>Wskazanie wydziałów</td><td><span className="badge green">lokalnie</span> kompetencje + głos podobnych spraw</td></tr>
              <tr><td>Podział na pytania</td><td><span className="badge green">reguły</span> + <span className="badge violet">AI opcjonalnie</span></td></tr>
              <tr><td>Projekt odpowiedzi</td><td><span className="badge green">szablony</span> + treść z wydziałów; <span className="badge violet">AI</span> tylko styl</td></tr>
              <tr><td>Anonimizacja</td><td><span className="badge green">reguły + sumy kontrolne</span> + <span className="badge violet">AI 2. warstwa</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card card-pad stack">
          <h2>Ochrona przed halucynacjami</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Treść merytoryczna pisma pochodzi <b>wyłącznie</b> z odpowiedzi wydziałów – każdy akapit ma wskazane źródło.</li>
            <li>Automatyczna weryfikacja: zdania bez oparcia w źródłach i <b>liczby, których nie ma w odpowiedziach wydziałów</b>, są zaznaczane na czerwono.</li>
            <li>Brak odpowiedzi na któreś pytanie = blokujące ostrzeżenie, a nie „wymyślona” odpowiedź.</li>
            <li>Ostateczną decyzję zawsze podejmuje urzędnik; system niczego nie wysyła.</li>
          </ul>
        </div>
        <div className="card card-pad stack">
          <h2>Ochrona danych</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Instalacja on-premise (Docker), baza SQLite/PostgreSQL na serwerze Urzędu, bez chmury.</li>
            <li>Pliki przetwarzane w pamięci; zaczernienia <b>fizycznie usuwają</b> dane z eksportowanego DOCX.</li>
            <li>Treści wniosków traktowane jako niezaufane – izolacja od instrukcji modelu (ochrona przed prompt injection).</li>
            <li>Pełna historia działań w każdej sprawie (kto, kiedy, co).</li>
            <li>Wdrożenie: logowanie przez AD/LDAP, role (koordynator, wydział, kierownik), szyfrowanie dysku.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
