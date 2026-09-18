from pathlib import Path
import fitz

source_dir = Path("attached_assets")
output_dir = Path(".agents/outputs/shopnear_pdf_previews")
output_dir.mkdir(parents=True, exist_ok=True)

for pdf_path in sorted(source_dir.glob("*.pdf")):
    document = fitz.open(pdf_path)
    print(f"{pdf_path.name}: {document.page_count} pages")
    for page_index in range(min(document.page_count, 3)):
        page = document[page_index]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        output_path = output_dir / f"{pdf_path.stem[:40]}-page-{page_index + 1}.png"
        pixmap.save(output_path)
        print(f"  rendered {output_path}")