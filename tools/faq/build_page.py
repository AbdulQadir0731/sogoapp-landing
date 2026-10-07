#!/usr/bin/env python3
"""Build app.sogoapps.com/faq/ from FAQ data (JSON, same model as the apps).

Usage: python3 build_page.py faq-data.json ../faq/index.html

The data model mirrors iOS Models/Help/FAQContent.swift exactly:
  category {id, icon, title, blurb, new?, items: [ {id, question, blocks: [...]} ]}
  block    {type: paragraph|tip|warning|note, text}
           {type: steps|bullets, items: [...]}
           {type: table, headers: [...], rows: [[...]]}
The page is fully static HTML (works with JavaScript off); a small inline script
adds search filtering and opens the answer named in the URL hash.
"""
import html, json, re, sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
out_path = sys.argv[2]

def e(s):
    return html.escape(s, quote=True)

def inline(s):
    """Escape, then allow **bold** for menu paths."""
    s = e(s)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)

def plain(s):
    return re.sub(r"\*\*(.+?)\*\*", r"\1", s)

LABEL = {"tip": "Tip", "warning": "Important", "note": "Good to know"}

def block_html(b):
    t = b["type"]
    if t == "paragraph":
        return f"<p>{inline(b['text'])}</p>"
    if t in ("tip", "warning", "note"):
        return (f'<div class="cl cl-{t}"><span class="cl-k">{LABEL[t]}</span>'
                f"<p>{inline(b['text'])}</p></div>")
    if t == "steps":
        return "<ol class=\"st\">" + "".join(f"<li>{inline(x)}</li>" for x in b["items"]) + "</ol>"
    if t == "bullets":
        return "<ul class=\"bl\">" + "".join(f"<li>{inline(x)}</li>" for x in b["items"]) + "</ul>"
    if t == "table":
        head = "".join(f"<th scope=\"col\">{inline(h)}</th>" for h in b["headers"])
        rows = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in b["rows"])
        return f'<div class="tw"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'
    raise ValueError(t)

def block_text(b):
    if "text" in b:
        return b["text"]
    if "items" in b:
        return " ".join(b["items"])
    return " ".join(b["headers"] + [c for r in b["rows"] for c in r])

chips, sections = [], []
total = 0
for c in data:
    new = c.get("new")
    badge = '<span class="new">New</span>' if new else ""
    chips.append(f'<a class="chip" href="#{e(c["id"])}">{e(c["title"])}{" ·&nbsp;new" if new else ""}</a>')
    items = []
    for it in c["items"]:
        total += 1
        idx = (c["title"] + " " + it["question"] + " " + " ".join(block_text(b) for b in it["blocks"]))
        idx = plain(idx).lower()
        body = "".join(block_html(b) for b in it["blocks"])
        items.append(
            f'<details class="qa" id="q-{e(it["id"])}" data-s="{e(idx)}">'
            f'<summary><span>{inline(it["question"])}</span><i aria-hidden="true"></i></summary>'
            f'<div class="ans">{body}'
            f'<a class="perma" href="#q-{e(it["id"])}">Link to this answer</a></div></details>')
    sections.append(
        f'<section class="cat" id="{e(c["id"])}" aria-labelledby="h-{e(c["id"])}">'
        f'<div class="cat-h"><h2 id="h-{e(c["id"])}">{e(c["title"])}{badge}</h2>'
        f'<p>{e(c["blurb"])}</p></div>{"".join(items)}</section>')

TEMPLATE = open(__file__.replace("build_page.py", "template.html"), encoding="utf-8").read()
page = (TEMPLATE
        .replace("{{CHIPS}}", "".join(chips))
        .replace("{{SECTIONS}}", "\n".join(sections))
        .replace("{{TOTAL}}", str(total))
        .replace("{{NCAT}}", str(len(data))))
open(out_path, "w", encoding="utf-8").write(page)
print(f"wrote {out_path}: {len(data)} categories, {total} answers, {len(page)//1024} KB")
