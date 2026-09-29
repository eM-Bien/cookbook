export default function RecipeLoading() {
  return (
    <div role="status" aria-label="Wczytywanie przepisu">
      <div className="hero skeleton" style={{ height: 200 }} />
      <div className="sheet">
        <div className="skeleton" style={{ height: 32, width: "70%" }} />
        <div className="stats">
          <div className="skeleton" style={{ height: 96 }} />
          <div className="skeleton" style={{ height: 96 }} />
        </div>
        <div className="stack stack-sm">
          <div className="skeleton" style={{ height: 66 }} />
          <div className="skeleton" style={{ height: 66 }} />
          <div className="skeleton" style={{ height: 66 }} />
        </div>
      </div>
    </div>
  );
}
