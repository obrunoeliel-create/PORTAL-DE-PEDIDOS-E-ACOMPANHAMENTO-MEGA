// Mostrado enquanto a tela do portal busca os dados. Também faz o conteúdo chegar em um bloco
// separado (Suspense), para telas grandes como o Histórico não começarem a ser montadas pela metade.
export default function PanelLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-stone-500" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" aria-hidden />
      Carregando…
    </div>
  );
}
