from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import ReadIn, ReadOut


@agent("read_document")
async def read_document(inp: ReadIn, ctx: Ctx) -> ReadOut:
    """Read the uploaded file's text from the inbox store"""
    data = await ctx.read_file(inp.document)
    return ReadOut(text=data.decode("utf-8", errors="replace"))
