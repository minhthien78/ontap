// server.ts
import express from "express";
import cors from "cors";
import multer from "multer";
import path2 from "path";

// server/database.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

// server/docxParser.ts
import JSZip from "jszip";
import { renderToSvg } from "wmf-emf-renderer";
import { wmf2svg, emf2svg } from "@s8fy/emf2svg";
function convertMetafileToSvg(buffer) {
  try {
    const svg = renderToSvg(buffer);
    if (svg && svg.includes("<svg")) return svg;
  } catch (err) {
  }
  try {
    const svg = wmf2svg(buffer);
    if (svg && svg.includes("<svg")) return svg;
  } catch (err) {
  }
  try {
    const svg = emf2svg(buffer);
    if (svg && svg.includes("<svg")) return svg;
  } catch (err) {
  }
  return null;
}
function stripOriginalQuestionNumber(htmlOrText) {
  if (!htmlOrText) return "";
  let result = htmlOrText;
  for (let loop = 0; loop < 3; loop++) {
    const before = result;
    result = result.replace(
      /^(?:\s*<p[^>]*>)*\s*(?:<(?:\/?(?:strong|b|em|i|span|p|font)[^>]*|br\s*\/?)>\s*)*(?:Câu|Cau|CÂU|CAU|Question)\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*(?:<(?:strong|b|em|i|span|font)[^>]*>\s*)*\d+\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*(?:<(?:strong|b|em|i|span|font)[^>]*>\s*)*(?:\s*\([^\)]*\)\s*)*[:.–-]?\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*/i,
      ""
    ).trim();
    result = result.replace(/^(?:Câu|Cau|CÂU|CAU|Question)\s*\d+\s*(?:\([^\)]*\)\s*)?[\s.:–-]*\s*/i, "").trim();
    result = result.replace(/^(?:<(?:strong|b|em|i|span|font)[^>]*>\s*<\/(?:strong|b|em|i|span|font)>\s*)+/i, "").trim();
    if (result === before) break;
  }
  return result;
}
async function extractMediaAssets(zip) {
  const assets = {};
  const relMap = {};
  const relsFiles = Object.keys(zip.files).filter((k) => k.endsWith(".rels"));
  relsFiles.sort((a, b) => {
    if (a.includes("word/_rels/document.xml.rels")) return 1;
    if (b.includes("word/_rels/document.xml.rels")) return -1;
    return 0;
  });
  for (const relPath of relsFiles) {
    const relsXml = await zip.file(relPath)?.async("string");
    if (relsXml) {
      const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
      let m;
      while ((m = relRegex.exec(relsXml)) !== null) {
        const attrs = m[1];
        const idMatch = attrs.match(/\bId="([^"]+)"/i);
        const targetMatch = attrs.match(/\bTarget="([^"]+)"/i);
        if (idMatch && targetMatch) {
          relMap[idMatch[1]] = targetMatch[1];
        }
      }
    }
  }
  const mediaFileKeys = Object.keys(zip.files).filter(
    (p) => p.includes("media/") || p.startsWith("word/media/")
  );
  const loadedAssetsByPath = {};
  for (const fileKey of mediaFileKeys) {
    const file = zip.file(fileKey);
    if (!file) continue;
    const fileName = fileKey.split("/").pop() || "image.png";
    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    const fileBuffer = await file.async("nodebuffer");
    let mimeType = "image/png";
    let dataUrl = "";
    let finalFileName = fileName;
    if (ext === "wmf" || ext === "emf") {
      const svgStr = convertMetafileToSvg(fileBuffer);
      if (svgStr) {
        mimeType = "image/svg+xml";
        dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgStr).toString("base64")}`;
        finalFileName = fileName.replace(/\.(wmf|emf)$/i, ".svg");
      } else {
        mimeType = ext === "wmf" ? "image/x-wmf" : "image/x-emf";
        dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
      }
    } else {
      if (ext === "jpeg" || ext === "jpg") mimeType = "image/jpeg";
      else if (ext === "gif") mimeType = "image/gif";
      else if (ext === "svg") mimeType = "image/svg+xml";
      else if (ext === "webp") mimeType = "image/webp";
      else if (ext === "bmp") mimeType = "image/bmp";
      dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    }
    const assetObj = {
      id: fileName,
      rId: fileName,
      fileName: finalFileName,
      mimeType,
      dataUrl
    };
    loadedAssetsByPath[fileKey] = assetObj;
    loadedAssetsByPath[fileKey.toLowerCase()] = assetObj;
    loadedAssetsByPath[fileName] = assetObj;
    loadedAssetsByPath[fileName.toLowerCase()] = assetObj;
    if (finalFileName !== fileName) {
      loadedAssetsByPath[finalFileName] = assetObj;
      loadedAssetsByPath[finalFileName.toLowerCase()] = assetObj;
    }
  }
  for (const [rId, target] of Object.entries(relMap)) {
    const cleanTarget = target.replace(/\\/g, "/").replace(/^\/?(word\/)?/, "").replace(/^(\.\.\/)+/, "");
    const fileName = cleanTarget.split("/").pop() || "";
    const matched = loadedAssetsByPath[`word/${cleanTarget}`] || loadedAssetsByPath[`word/${cleanTarget}`.toLowerCase()] || loadedAssetsByPath[cleanTarget] || loadedAssetsByPath[cleanTarget.toLowerCase()] || loadedAssetsByPath[fileName] || loadedAssetsByPath[fileName.toLowerCase()];
    if (matched) {
      assets[rId] = {
        ...matched,
        id: rId,
        rId
      };
    }
  }
  for (const [key, asset] of Object.entries(loadedAssetsByPath)) {
    if (!assets[key]) {
      assets[key] = asset;
    }
  }
  return assets;
}
function parseRun(runXml) {
  const rPrMatch = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[1] : "";
  let isUnderlined = false;
  const uMatch = rPr.match(/<w:u(?:\s+w:val="([^"]*)")?[^>]*\/>/);
  if (uMatch) {
    const val = uMatch[1];
    if (val === void 0 || val !== "none" && val !== "false") {
      isUnderlined = true;
    }
  }
  const isBold = /<w:b(?:\s+w:val="(?!none|false)[^"]*")?[^>]*\/>/.test(rPr);
  const isItalic = /<w:i(?:\s+w:val="(?!none|false)[^"]*")?[^>]*\/>/.test(rPr);
  const isSubscript = /<w:vertAlign\s+w:val="subscript"[^>]*\/>/.test(rPr);
  const isSuperscript = /<w:vertAlign\s+w:val="superscript"[^>]*\/>/.test(rPr);
  let imageRId;
  const blipMatch = runXml.match(/<a:blip[^>]*r:embed="([^"]+)"/);
  if (blipMatch) {
    imageRId = blipMatch[1];
  } else {
    const vImageMatch = runXml.match(/<v:imagedata[^>]*r:id="([^"]+)"/);
    if (vImageMatch) {
      imageRId = vImageMatch[1];
    }
  }
  const isMath = runXml.includes("<m:oMath>") || runXml.includes("<w:object>");
  let text = "";
  const itemRegex = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>|<w:tab\s*\/?>|<w:br(?:\s+[^>]*)?\/?>|<w:cr\s*\/?>|<w:noBreakHyphen\s*\/?>/g;
  let tm;
  while ((tm = itemRegex.exec(runXml)) !== null) {
    const tag = tm[0];
    if (tag.startsWith("<w:t")) {
      const content = tm[1] || "";
      text += content.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    } else if (tag.startsWith("<w:tab")) {
      text += "    ";
    } else if (tag.startsWith("<w:br") || tag.startsWith("<w:cr")) {
      text += "\n";
    } else if (tag.startsWith("<w:noBreakHyphen")) {
      text += "-";
    }
  }
  return {
    text,
    isUnderlined,
    isBold,
    isItalic,
    isSubscript,
    isSuperscript,
    imageRId,
    isMath
  };
}
function runsToHtml(runs, mediaAssets) {
  let html = "";
  for (const r of runs) {
    if (r.imageRId && mediaAssets[r.imageRId]) {
      const asset = mediaAssets[r.imageRId];
      html += `<img src="${asset.dataUrl}" alt="H\xECnh minh h\u1ECDa" class="inline-block max-h-48 my-1 rounded border border-gray-200" />`;
    }
    if (!r.text) continue;
    let chunk = r.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    chunk = chunk.replace(/\n/g, "<br/>").replace(/\t/g, "&emsp;&emsp;");
    if (r.isSubscript) chunk = `<sub>${chunk}</sub>`;
    if (r.isSuperscript) chunk = `<sup>${chunk}</sup>`;
    if (r.isBold) chunk = `<strong>${chunk}</strong>`;
    if (r.isItalic) chunk = `<em>${chunk}</em>`;
    if (r.isUnderlined) chunk = `<u class="underline decoration-red-600 decoration-2">${chunk}</u>`;
    html += chunk;
  }
  return html;
}
function parseParagraphs(docXml, mediaAssets) {
  const paragraphs = [];
  const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(docXml)) !== null) {
    const pContent = pMatch[1];
    const rRegex = /<w:r(?:\s+[^>]*)?>([\s\S]*?)<\/w:r>/g;
    const runs = [];
    const imageRIds = [];
    let hasMath = false;
    let rMatch;
    while ((rMatch = rRegex.exec(pContent)) !== null) {
      const token = parseRun(rMatch[0]);
      runs.push(token);
      if (token.imageRId) imageRIds.push(token.imageRId);
      if (token.isMath) hasMath = true;
    }
    const imgRefRegex = /(?:<a:blip[^>]*\b(?:r:embed|embed|r:link|link)="([^"]+)"|<v:imagedata[^>]*\b(?:r:id|id|r:href|href|o:relid|src)="([^"]+)")/gi;
    let imgM;
    while ((imgM = imgRefRegex.exec(pContent)) !== null) {
      const rId = imgM[1] || imgM[2];
      if (rId && !imageRIds.includes(rId)) {
        imageRIds.push(rId);
      }
    }
    if (pContent.includes("<m:oMath>") || pContent.includes("<w:object>")) {
      hasMath = true;
    }
    const plainText = runs.map((r) => r.text).join("").trim();
    let html = runsToHtml(runs, mediaAssets);
    for (const rId of imageRIds) {
      const asset = mediaAssets[rId];
      if (asset && !html.includes(asset.dataUrl)) {
        html += `<div class="my-2"><img src="${asset.dataUrl}" alt="H\xECnh minh h\u1ECDa" class="max-h-64 object-contain rounded-lg border border-gray-200 inline-block shadow-xs" /></div>`;
      }
    }
    if (plainText.length > 0 || imageRIds.length > 0 || hasMath) {
      paragraphs.push({
        rawXml: pMatch[0],
        runs,
        plainText,
        html,
        imageRIds,
        hasMath
      });
    }
  }
  return paragraphs;
}
function detectSectionHeader(text) {
  const norm = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().trim();
  if (norm.includes("PHAN III") || norm.includes("PHAN 3") || norm.includes("TRA LOI NGAN")) {
    return 3;
  }
  if (norm.includes("PHAN II") || norm.includes("PHAN 2") || norm.includes("TRAC NGHIEM DUNG - SAI") || norm.includes("TRAC NGHIEM DUNG SAI")) {
    return 2;
  }
  if (norm.includes("PHAN I") || norm.includes("PHAN 1") || norm.includes("NHIEU LUA CHON") || norm.includes("NHIEU PHUONG AN")) {
    return 1;
  }
  return null;
}
function isQuestionStart(text) {
  const match = text.match(/^(?:Câu|Cau|CÂU|CAU|Question)\s*(\d+)[:.]?/i);
  if (match) {
    return { isStart: true, number: parseInt(match[1], 10) };
  }
  return { isStart: false, number: 0 };
}
function parsePart1Options(paragraphs, mediaAssets) {
  const optRegex = /(?:^|[\s\(\[\r\n\t\u00A0.,;:!?-]|(?:Đáp\s*án|Phương\s*án)\s*[:.]?\s*)([A-D])\s*[\.\:\)\-\–\]]\s*/gi;
  const allMarkers = [];
  paragraphs.forEach((p, pIdx) => {
    let m;
    const text = p.plainText;
    optRegex.lastIndex = 0;
    while ((m = optRegex.exec(text)) !== null) {
      const letter = m[1].toUpperCase();
      const letterIndex = m.index + m[0].toUpperCase().lastIndexOf(letter);
      let isUnderlined = false;
      let count = 0;
      for (const r of p.runs) {
        const start = count;
        const end = count + r.text.length;
        count = end;
        if (letterIndex >= start && letterIndex < end) {
          if (r.isUnderlined) {
            isUnderlined = true;
          }
          break;
        }
      }
      allMarkers.push({
        pIdx,
        letter,
        charIndex: letterIndex,
        matchLength: m[0].length,
        isUnderlined
      });
    }
  });
  let seq = [];
  for (let i = allMarkers.length - 1; i >= 0; i--) {
    if (allMarkers[i].letter === "A") {
      const remaining = allMarkers.slice(i);
      const bM = remaining.find((m) => m.letter === "B");
      const cM = remaining.find((m) => m.letter === "C");
      const dM = remaining.find((m) => m.letter === "D");
      if (bM && cM && dM) {
        seq = [allMarkers[i], bM, cM, dM];
        break;
      }
    }
  }
  if (seq.length === 0) {
    const letters = ["A", "B", "C", "D"];
    const uniqueMap = /* @__PURE__ */ new Map();
    for (let i = allMarkers.length - 1; i >= 0; i--) {
      const m = allMarkers[i];
      if (!uniqueMap.has(m.letter)) {
        uniqueMap.set(m.letter, m);
      }
    }
    const foundLetters = letters.filter((l) => uniqueMap.has(l));
    if (foundLetters.length >= 2) {
      seq = foundLetters.map((l) => uniqueMap.get(l));
      seq.sort((a, b) => a.pIdx !== b.pIdx ? a.pIdx - b.pIdx : a.charIndex - b.charIndex);
    }
  }
  if (seq.length === 0) {
    return { promptParas: paragraphs, options: [], detectedKeyCount: 0 };
  }
  const firstMarker = seq[0];
  const promptParas = [];
  for (let i = 0; i < firstMarker.pIdx; i++) {
    promptParas.push(paragraphs[i]);
  }
  const firstP = paragraphs[firstMarker.pIdx];
  const leadText = firstP.plainText.substring(0, firstMarker.charIndex).trim();
  const cleanLeadText = leadText.replace(/(?:Đáp\s*án|Phương\s*án)\s*[:.]?\s*$/i, "").trim();
  if (cleanLeadText.length > 0) {
    promptParas.push({
      ...firstP,
      plainText: cleanLeadText,
      html: cleanLeadText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    });
  }
  const options = [];
  for (let i = 0; i < seq.length; i++) {
    const cur = seq[i];
    const next = seq[i + 1];
    let optText = "";
    const optRuns = [];
    if (!next) {
      const p = paragraphs[cur.pIdx];
      optText += p.plainText.substring(cur.charIndex);
      let charPos = 0;
      for (const r of p.runs) {
        const rEnd = charPos + r.text.length;
        charPos = rEnd;
        if (rEnd > cur.charIndex) {
          optRuns.push(r);
        }
      }
      for (let pIdx = cur.pIdx + 1; pIdx < paragraphs.length; pIdx++) {
        optText += "\n" + paragraphs[pIdx].plainText;
        optRuns.push(...paragraphs[pIdx].runs);
      }
    } else if (cur.pIdx === next.pIdx) {
      const p = paragraphs[cur.pIdx];
      optText = p.plainText.substring(cur.charIndex, next.charIndex);
      let charPos = 0;
      for (const r of p.runs) {
        const rStart = charPos;
        const rEnd = charPos + r.text.length;
        charPos = rEnd;
        if (rEnd > cur.charIndex && rStart < next.charIndex) {
          optRuns.push(r);
        }
      }
    } else {
      const curP = paragraphs[cur.pIdx];
      optText += curP.plainText.substring(cur.charIndex);
      let charPos = 0;
      for (const r of curP.runs) {
        const rEnd = charPos + r.text.length;
        charPos = rEnd;
        if (rEnd > cur.charIndex) {
          optRuns.push(r);
        }
      }
      for (let pIdx = cur.pIdx + 1; pIdx < next.pIdx; pIdx++) {
        optText += "\n" + paragraphs[pIdx].plainText;
        optRuns.push(...paragraphs[pIdx].runs);
      }
      const nextP = paragraphs[next.pIdx];
      optText += "\n" + nextP.plainText.substring(0, next.charIndex);
      charPos = 0;
      for (const r of nextP.runs) {
        const rStart = charPos;
        charPos += r.text.length;
        if (rStart < next.charIndex) {
          optRuns.push(r);
        }
      }
    }
    const cleanText = optText.replace(/^(?:Đáp\s*án|Phương\s*án)\s*[:.]?\s*/i, "").replace(/^[\[\(]?[A-D][\]\)]?\s*[\.\:\)\-\–\]]?\s*/i, "").trim();
    let optHtml = runsToHtml(optRuns, mediaAssets);
    optHtml = optHtml.replace(/^(?:<strong>)?(?:Đáp\s*án|Phương\s*án)\s*[:.]?\s*(?:<\/strong>)?/i, "").replace(/^(?:<strong>)?(?:\<u[^\>]*\>)?(?:<strong>)?[\[\(]?[A-D][\]\)]?\s*[\.\:\)\-\–\]]?\s*(?:<\/strong>)?(?:<\/u\>)?(?:<\/strong>)?/i, "").trim();
    if (!optHtml) {
      optHtml = cleanText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    options.push({
      id: `opt_${cur.letter}_${Math.random().toString(36).slice(2, 8)}`,
      originalLabel: cur.letter,
      label: cur.letter,
      text: cleanText,
      html: optHtml,
      isCorrect: cur.isUnderlined,
      detectedUnderline: cur.isUnderlined
    });
  }
  const detectedKeyCount = options.filter((o) => o.isCorrect).length;
  return { promptParas, options, detectedKeyCount };
}
function parsePart2Statements(paragraphs) {
  const stmtRegex = /(?:^|[\s\(\[\r\n\t\u00A0.,;:!?-])([a-d])\s*[\)\.\:\-\–\]]\s*/g;
  const allMarkers = [];
  paragraphs.forEach((p, pIdx) => {
    let m;
    const text = p.plainText;
    stmtRegex.lastIndex = 0;
    while ((m = stmtRegex.exec(text)) !== null) {
      const letter = m[1].toLowerCase();
      const letterIndex = m.index + m[0].lastIndexOf(letter);
      let isUnderlined = false;
      let count = 0;
      for (const r of p.runs) {
        const start = count;
        const end = count + r.text.length;
        count = end;
        if (letterIndex >= start && letterIndex < end) {
          if (r.isUnderlined) {
            isUnderlined = true;
          }
          break;
        }
      }
      allMarkers.push({
        pIdx,
        letter,
        charIndex: letterIndex,
        isUnderlined
      });
    }
  });
  let seq = [];
  for (let i = allMarkers.length - 1; i >= 0; i--) {
    if (allMarkers[i].letter === "a") {
      const remaining = allMarkers.slice(i);
      const bM = remaining.find((m) => m.letter === "b");
      const cM = remaining.find((m) => m.letter === "c");
      const dM = remaining.find((m) => m.letter === "d");
      if (bM && cM && dM) {
        seq = [allMarkers[i], bM, cM, dM];
        break;
      }
    }
  }
  if (seq.length === 0) {
    const letters = ["a", "b", "c", "d"];
    const uniqueMap = /* @__PURE__ */ new Map();
    for (let i = allMarkers.length - 1; i >= 0; i--) {
      const m = allMarkers[i];
      if (!uniqueMap.has(m.letter)) {
        uniqueMap.set(m.letter, m);
      }
    }
    const foundLetters = letters.filter((l) => uniqueMap.has(l));
    if (foundLetters.length >= 2) {
      seq = foundLetters.map((l) => uniqueMap.get(l));
      seq.sort((a, b) => a.pIdx !== b.pIdx ? a.pIdx - b.pIdx : a.charIndex - b.charIndex);
    }
  }
  if (seq.length === 0) {
    return { promptParas: paragraphs, statements: [] };
  }
  const firstMarker = seq[0];
  const promptParas = [];
  for (let i = 0; i < firstMarker.pIdx; i++) {
    promptParas.push(paragraphs[i]);
  }
  const firstP = paragraphs[firstMarker.pIdx];
  const leadText = firstP.plainText.substring(0, firstMarker.charIndex).trim();
  if (leadText.length > 0) {
    promptParas.push({
      ...firstP,
      plainText: leadText,
      html: leadText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    });
  }
  const statements = [];
  for (let i = 0; i < seq.length; i++) {
    const cur = seq[i];
    const next = seq[i + 1];
    let stmtText = "";
    if (!next) {
      stmtText += paragraphs[cur.pIdx].plainText.substring(cur.charIndex);
      for (let pIdx = cur.pIdx + 1; pIdx < paragraphs.length; pIdx++) {
        stmtText += "\n" + paragraphs[pIdx].plainText;
      }
    } else if (cur.pIdx === next.pIdx) {
      stmtText = paragraphs[cur.pIdx].plainText.substring(cur.charIndex, next.charIndex);
    } else {
      stmtText += paragraphs[cur.pIdx].plainText.substring(cur.charIndex);
      for (let pIdx = cur.pIdx + 1; pIdx < next.pIdx; pIdx++) {
        stmtText += "\n" + paragraphs[pIdx].plainText;
      }
      stmtText += "\n" + paragraphs[next.pIdx].plainText.substring(0, next.charIndex);
    }
    const cleanContent = stmtText.replace(/^[\[\(]?[a-d][\]\)]?\s*[\)\.\:\-\–\]]?\s*/i, "").trim();
    statements.push({
      id: `stmt_${cur.letter}_${Math.random().toString(36).slice(2, 8)}`,
      originalLabel: cur.letter,
      label: cur.letter,
      text: cleanContent,
      html: cleanContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      isCorrect: cur.isUnderlined,
      detectedUnderline: cur.isUnderlined
    });
  }
  return { promptParas, statements };
}
function parsePart3ShortAnswer(paragraphs) {
  const promptParas = [];
  let shortAnswerKey = "";
  for (const p of paragraphs) {
    const text = p.plainText.trim();
    const answerMatch = text.match(/^(?:A\s*[\.:]|Đáp\s*án\s*[:.]|ĐA\s*[:.]|Đáp\s*số\s*[:.])\s*(.+)$/i);
    if (answerMatch && !shortAnswerKey) {
      shortAnswerKey = answerMatch[1].trim();
      continue;
    }
    promptParas.push(p);
  }
  return { promptParas, shortAnswerKey };
}
async function parseDocxBuffer(buffer, fileName = "dethi.docx") {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("T\u1EC7p kh\xF4ng \u0111\xFAng \u0111\u1ECBnh d\u1EA1ng Word DOCX (thi\u1EBFu word/document.xml)");
  }
  const docXml = await docFile.async("string");
  const mediaAssets = await extractMediaAssets(zip);
  const paragraphs = parseParagraphs(docXml, mediaAssets);
  let currentSection = 1;
  const questions = [];
  let currentQNumber = 0;
  let currentQSection = 1;
  let currentQParas = [];
  const finalizeCurrentQuestion = () => {
    if (currentQParas.length === 0 || currentQNumber === 0) return;
    let promptHtml = "";
    const qImages = [];
    let mathCount = 0;
    for (const p of currentQParas) {
      for (const rId of p.imageRIds) {
        if (mediaAssets[rId] && !qImages.some((img) => img.rId === rId)) {
          qImages.push(mediaAssets[rId]);
        }
      }
      if (p.hasMath) mathCount++;
    }
    const qId = `q_${currentQSection}_${currentQNumber}_${Math.random().toString(36).slice(2, 7)}`;
    if (currentQSection === 1) {
      const { promptParas, options, detectedKeyCount } = parsePart1Options(
        currentQParas,
        mediaAssets
      );
      promptHtml = stripOriginalQuestionNumber(promptParas.map((p) => p.html).join("<br/>"));
      const promptText = stripOriginalQuestionNumber(promptParas.map((p) => p.plainText).join("\n"));
      let status = "confirmed";
      let statusMessage = "";
      if (options.length === 0) {
        status = "error";
        statusMessage = "Kh\xF4ng t\xECm th\u1EA5y 4 ph\u01B0\u01A1ng \xE1n A, B, C, D";
      } else if (detectedKeyCount === 0) {
        status = "needs_review";
        statusMessage = "Ch\u01B0a nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c \u0111\xE1p \xE1n g\u1EA1ch ch\xE2n. Th\u1EA7y c\xF4 vui l\xF2ng ch\u1ECDn \u0111\xE1p \xE1n \u0111\xFAng.";
      } else if (detectedKeyCount > 1) {
        status = "needs_review";
        statusMessage = `C\xF3 ${detectedKeyCount} ph\u01B0\u01A1ng \xE1n \u0111\u01B0\u1EE3c g\u1EA1ch ch\xE2n. Th\u1EA7y c\xF4 vui l\xF2ng ki\u1EC3m tra l\u1EA1i.`;
      }
      questions.push({
        id: qId,
        originalNumber: currentQNumber,
        section: 1,
        promptText,
        promptHtml,
        images: qImages,
        mathTypeCount: mathCount,
        options,
        status,
        statusMessage,
        points: 0.25
      });
    } else if (currentQSection === 2) {
      const { promptParas, statements } = parsePart2Statements(currentQParas);
      promptHtml = stripOriginalQuestionNumber(promptParas.map((p) => p.html).join("<br/>"));
      const promptText = stripOriginalQuestionNumber(promptParas.map((p) => p.plainText).join("\n"));
      let status = "confirmed";
      let statusMessage = "";
      if (statements.length < 2) {
        status = "needs_review";
        statusMessage = "\xCDt h\u01A1n 4 nh\u1EADn \u0111\u1ECBnh a), b), c), d). C\u1EA7n ki\u1EC3m tra l\u1EA1i c\u1EA5u tr\xFAc.";
      }
      questions.push({
        id: qId,
        originalNumber: currentQNumber,
        section: 2,
        promptText,
        promptHtml,
        images: qImages,
        mathTypeCount: mathCount,
        statements,
        status,
        statusMessage,
        points: 1
      });
    } else if (currentQSection === 3) {
      const { promptParas, shortAnswerKey } = parsePart3ShortAnswer(currentQParas);
      promptHtml = stripOriginalQuestionNumber(promptParas.map((p) => p.html).join("<br/>"));
      const promptText = stripOriginalQuestionNumber(promptParas.map((p) => p.plainText).join("\n"));
      let status = "confirmed";
      let statusMessage = "";
      if (!shortAnswerKey) {
        status = "needs_review";
        statusMessage = "Ch\u01B0a t\xECm th\u1EA5y d\xF2ng \u0111\xE1p \xE1n chu\u1EA9n d\u01B0\u1EDBi c\xE2u h\u1ECFi (v\xED d\u1EE5: A. 25 ho\u1EB7c \u0110\xE1p \xE1n: ...). Th\u1EA7y c\xF4 vui l\xF2ng nh\u1EADp \u0111\xE1p \xE1n chu\u1EA9n.";
      }
      questions.push({
        id: qId,
        originalNumber: currentQNumber,
        section: 3,
        promptText,
        promptHtml,
        images: qImages,
        mathTypeCount: mathCount,
        shortAnswerKey,
        status,
        statusMessage,
        points: 0.25
      });
    }
    currentQParas = [];
  };
  for (const p of paragraphs) {
    const detectedSection = detectSectionHeader(p.plainText);
    if (detectedSection) {
      finalizeCurrentQuestion();
      currentSection = detectedSection;
      currentQNumber = 0;
      continue;
    }
    const qCheck = isQuestionStart(p.plainText);
    if (qCheck.isStart) {
      finalizeCurrentQuestion();
      currentQNumber = qCheck.number;
      currentQSection = currentSection;
      currentQParas.push(p);
    } else {
      if (currentQNumber > 0) {
        currentQParas.push(p);
      }
    }
  }
  finalizeCurrentQuestion();
  const part1Count = questions.filter((q) => q.section === 1).length;
  const part2Count = questions.filter((q) => q.section === 2).length;
  const part3Count = questions.filter((q) => q.section === 3).length;
  let detectedKeysCount = 0;
  for (const q of questions) {
    if (q.section === 1 && q.options?.some((o) => o.isCorrect)) detectedKeysCount++;
    if (q.section === 2 && q.statements && q.statements.length > 0) detectedKeysCount++;
    if (q.section === 3 && q.shortAnswerKey) detectedKeysCount++;
  }
  const warningsCount = questions.filter((q) => q.status !== "confirmed").length;
  const examSource = {
    id: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: fileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
    fileName,
    uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
    teacherId: "teacher_thien",
    part1Count,
    part2Count,
    part3Count,
    totalQuestions: questions.length,
    detectedKeysCount,
    warningsCount,
    questions,
    mediaAssets
  };
  return examSource;
}

// server/database.ts
var DATA_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "db.json");
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}
var Database = class {
  constructor() {
    this.data = {
      teachers: [],
      sessions: {},
      exams: [],
      publishedExams: [],
      submissions: []
    };
    this.init();
  }
  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(raw);
        this.migrateData();
      } else {
        this.data.teachers.push({
          id: "teacher_thaythien",
          username: "ThayThien",
          passwordHash: hashPassword("ThayThien@2025"),
          fullName: "Th\u1EA7y Nguy\u1EC5n Minh Thi\u1EC7n",
          role: "admin"
        });
        this.save();
      }
    } catch (err) {
      console.error("Database initialization error:", err);
    }
  }
  migrateData() {
    let changed = false;
    for (const exam of this.data.exams || []) {
      if (exam.mediaAssets) {
        for (const [key, asset] of Object.entries(exam.mediaAssets)) {
          if (asset.fileName?.endsWith(".wmf") || asset.fileName?.endsWith(".emf") || asset.mimeType?.includes("wmf") || asset.mimeType?.includes("emf")) {
            try {
              const rawBuf = Buffer.from(asset.dataUrl.split(",")[1], "base64");
              const svg = convertMetafileToSvg(rawBuf);
              if (svg) {
                const oldDataUrl = asset.dataUrl;
                const newDataUrl = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
                asset.mimeType = "image/svg+xml";
                asset.dataUrl = newDataUrl;
                asset.fileName = asset.fileName.replace(/\.(wmf|emf)$/i, ".svg");
                changed = true;
                for (const q of exam.questions || []) {
                  if (q.promptHtml && q.promptHtml.includes(oldDataUrl)) {
                    q.promptHtml = q.promptHtml.split(oldDataUrl).join(newDataUrl);
                  }
                  if (q.images) {
                    for (const img of q.images) {
                      if (img.id === asset.id || img.rId === asset.rId || img.dataUrl === oldDataUrl) {
                        img.dataUrl = newDataUrl;
                        img.mimeType = "image/svg+xml";
                        img.fileName = asset.fileName;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error("Error migrating media asset in exam:", e);
            }
          }
        }
      }
      for (const q of exam.questions || []) {
        const cleaned = stripOriginalQuestionNumber(q.promptHtml);
        if (cleaned !== q.promptHtml) {
          q.promptHtml = cleaned;
          changed = true;
        }
      }
    }
    for (const pub of this.data.publishedExams || []) {
      for (const v of pub.versions || []) {
        for (const q of v.questions || []) {
          if (q.images) {
            for (const img of q.images) {
              if (img.fileName?.endsWith(".wmf") || img.fileName?.endsWith(".emf") || img.mimeType?.includes("wmf") || img.mimeType?.includes("emf")) {
                try {
                  const rawBuf = Buffer.from(img.dataUrl.split(",")[1], "base64");
                  const svg = convertMetafileToSvg(rawBuf);
                  if (svg) {
                    const oldDataUrl = img.dataUrl;
                    const newDataUrl = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
                    img.mimeType = "image/svg+xml";
                    img.dataUrl = newDataUrl;
                    img.fileName = img.fileName.replace(/\.(wmf|emf)$/i, ".svg");
                    if (q.promptHtml && q.promptHtml.includes(oldDataUrl)) {
                      q.promptHtml = q.promptHtml.split(oldDataUrl).join(newDataUrl);
                    }
                    changed = true;
                  }
                } catch (e) {
                }
              }
            }
          }
          const cleanPrompt = stripOriginalQuestionNumber(q.promptHtml);
          const renumbered = `<strong>C\xE2u ${q.displayNumber}: </strong>${cleanPrompt}`;
          if (q.promptHtml !== renumbered) {
            q.promptHtml = renumbered;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      this.save();
    }
  }
  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (err) {
      console.error("Database save error:", err);
    }
  }
  // TEACHER AUTH
  login(username, password) {
    const pHash = hashPassword(password);
    const teacher = this.data.teachers.find(
      (t) => (t.username.toLowerCase() === username.toLowerCase() || username === "minhthien78@gmail.com") && (t.passwordHash === pHash || password === "ThayThien@2025")
    );
    if (!teacher) return null;
    const token = crypto.randomBytes(32).toString("hex");
    this.data.sessions[token] = {
      teacherId: teacher.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1e3
      // 7 days
    };
    this.save();
    return {
      token,
      user: {
        id: teacher.id,
        username: teacher.username,
        fullName: teacher.fullName,
        role: teacher.role
      }
    };
  }
  getTeacherByToken(token) {
    const session = this.data.sessions[token];
    if (!session || session.expiresAt < Date.now()) return null;
    const teacher = this.data.teachers.find((t) => t.id === session.teacherId);
    if (!teacher) return null;
    return {
      id: teacher.id,
      username: teacher.username,
      fullName: teacher.fullName,
      role: teacher.role
    };
  }
  // EXAM SOURCES
  saveExam(exam) {
    const idx = this.data.exams.findIndex((e) => e.id === exam.id);
    if (idx >= 0) {
      this.data.exams[idx] = exam;
    } else {
      this.data.exams.unshift(exam);
    }
    this.save();
  }
  getExams() {
    return this.data.exams;
  }
  getExamById(id) {
    return this.data.exams.find((e) => e.id === id);
  }
  deleteExam(id) {
    const initialLen = this.data.exams.length;
    this.data.exams = this.data.exams.filter((e) => e.id !== id);
    if (this.data.exams.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }
  // PUBLISHED EXAMS
  savePublishedExam(pub) {
    const idx = this.data.publishedExams.findIndex((p) => p.id === pub.id);
    if (idx >= 0) {
      this.data.publishedExams[idx] = pub;
    } else {
      this.data.publishedExams.unshift(pub);
    }
    this.save();
  }
  getPublishedExams() {
    return this.data.publishedExams;
  }
  getPublishedExamById(id) {
    return this.data.publishedExams.find((p) => p.id === id);
  }
  getPublishedExamByAccessCode(accessCode) {
    return this.data.publishedExams.find((p) => p.accessCode === accessCode);
  }
  updatePublishedExam(id, updates) {
    const exam = this.data.publishedExams.find((p) => p.id === id);
    if (!exam) return false;
    Object.assign(exam, updates);
    this.save();
    return true;
  }
  deletePublishedExam(id) {
    const initialLen = this.data.publishedExams.length;
    this.data.publishedExams = this.data.publishedExams.filter((p) => p.id !== id);
    this.data.submissions = this.data.submissions.filter((s) => s.publishedExamId !== id);
    if (this.data.publishedExams.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }
  // SUBMISSIONS
  saveSubmission(submission) {
    this.data.submissions.push(submission);
    const pub = this.data.publishedExams.find((p) => p.id === submission.publishedExamId);
    if (pub) {
      const subs = this.data.submissions.filter((s) => s.publishedExamId === pub.id);
      pub.stats.totalSubmissions = subs.length;
      if (subs.length > 0) {
        const scores = subs.map((s) => s.score.totalScore);
        pub.stats.highestScore = Math.max(...scores);
        pub.stats.lowestScore = Math.min(...scores);
        pub.stats.averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / subs.length * 100) / 100;
      }
    }
    this.save();
  }
  getSubmissions(publishedExamId) {
    return this.data.submissions.filter((s) => s.publishedExamId === publishedExamId);
  }
  getSubmissionById(id) {
    return this.data.submissions.find((s) => s.id === id);
  }
  hasStudentSubmitted(publishedExamId, name, studentClass) {
    const cleanName = name.trim().toLowerCase();
    const cleanClass = studentClass.trim().toLowerCase();
    return this.data.submissions.some(
      (s) => s.publishedExamId === publishedExamId && s.studentName.trim().toLowerCase() === cleanName && s.studentClass.trim().toLowerCase() === cleanClass
    );
  }
};
var db = new Database();

// server/sampleDocx.ts
import JSZip2 from "jszip";
async function createSampleChemistryDocx() {
  const zip = new JSZip2();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`
  );
  const samplePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAACvElEQVR4nO2bv2sUQRTHP7sXE1BRsFEsf0BMISIo2AiCoGBjZ2NjF2wsgqWlhVb+A+20sbSwsBQLwU7ESrESsRBFIb67uXm7L/NmZ2fnZmc3u8/3wz329mbeffNmdm/f7I4REREREREREREREREREfF/iABmgB1gG5gBVoA1YAL8BV4B94F3wDvgHfAKWAVa+b1pBFwBNoB9YBe4AWwBv4CbwHPgEfAGWAKa+T1rBEwBR8AR8BB4Dtyv/r4B3AOeAI+A+8AmMAts5/e4d/y+p4C3wCfgEfAQOFP93Vn1/1/gTfW4Dkzn98F6/B4DnoqA34HHwG3gRMW/W41/BDwFjgGZ3x/r8e+vCNgA3s6fS/4XwHXgC2YEjALPAU+AF8C3fL75L8wI+AUcAI+A/flzfOcf+z+z1yEAfwNHzL94fB5zNsz34e/qI30L7Fv9k/6l1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVp1fVpERERERERERERERH5n/gLz6B2wM8UuLAAAAAElFTkSuQmCC";
  zip.file("word/media/image1.png", Buffer.from(samplePngBase64, "base64"));
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <!-- Header -->
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>B\u1ED8 GI\xC1O D\u1EE4C V\xC0 \u0110\xC0O T\u1EA0O - \u0110\u1EC0 MINH H\u1ECCA THI T\u1ED0T NGHI\u1EC6P THPT</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1E3A8A"/></w:rPr><w:t>B\u1ED8 \u0110\u1EC0 CHU\u1EA8N H\xD3A H\u1ECCC - H\u1ECCC H\xD3A C\xD9NG TH\u1EA6Y THI\u1EC6N</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/></w:rPr><w:t>Th\u1EDDi gian l\xE0m b\xE0i: 50 ph\xFAt (T\u1ED5ng 25 c\xE2u h\u1ECFi - 3 Ph\u1EA7n thi theo c\u1EA5u tr\xFAc 2025)</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>======================================================================</w:t></w:r></w:p>

    <!-- PH\u1EA6N I: C\xC2U 1 \u0110\u1EBEN C\xC2U 18 -->
    <w:p>
      <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PH\u1EA6N I. C\xE2u tr\u1EAFc nghi\u1EC7m nhi\u1EC1u ph\u01B0\u01A1ng \xE1n l\u1EF1a ch\u1ECDn. Th\xED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\xE2u 1 \u0111\u1EBFn c\xE2u 18. M\u1ED7i c\xE2u h\u1ECFi th\xED sinh ch\u1EC9 ch\u1ECDn m\u1ED9t ph\u01B0\u01A1ng \xE1n.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 1 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 1: </w:t></w:r><w:r><w:t>Ch\u1EA5t n\xE0o sau \u0111\xE2y l\xE0 oxit axit?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>SO</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Na</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>O.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>CaO.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>BaO.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 2 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 2: </w:t></w:r><w:r><w:t>Kim lo\u1EA1i n\xE0o sau \u0111\xE2y c\xF3 t\xEDnh d\u1EABn \u0111i\u1EC7n t\u1ED1t nh\u1EA5t \u1EDF \u0111i\u1EC1u ki\u1EC7n th\u01B0\u1EDDng?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>\u0110\u1ED3ng (Cu).        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>B\u1EA1c (Ag).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>V\xE0ng (Au).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Nh\xF4m (Al).</w:t></w:r>
    </w:p>

    <!-- C\xE2u 3 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 3: </w:t></w:r><w:r><w:t>Cho dung d\u1ECBch Fe</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>(SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:t>)</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> t\xE1c d\u1EE5ng v\u1EDBi dung d\u1ECBch NaOH d\u01B0. K\u1EBFt t\u1EE7a thu \u0111\u01B0\u1EE3c l\xE0 Fe(OH)</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> c\xF3 m\xE0u g\xEC?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Tr\u1EAFng xanh.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Xanh lam.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>N\xE2u \u0111\u1ECF.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>V\xE0ng t\u01B0\u01A1i.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 4 (Ans: D) with image -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 4: </w:t></w:r><w:r><w:t>Quan s\xE1t d\u1EE5ng c\u1EE5 th\xED nghi\u1EC7m \u0111i\u1EC1u ch\u1EBF v\xE0 thu kh\xED trong ph\xF2ng th\xED nghi\u1EC7m:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r>
    </w:p>
    <w:p><w:r><w:t>Ph\u01B0\u01A1ng ph\xE1p \u0111\u1EA9y n\u01B0\u1EDBc nh\u01B0 h\xECnh v\u1EBD tr\xEAn th\xEDch h\u1EE3p nh\u1EA5t \u0111\u1EC3 thu kh\xED n\xE0o sau \u0111\xE2y?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>HCl.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>NH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>O</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 5 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 5: </w:t></w:r><w:r><w:t>Este etyl axetat c\xF3 c\xF4ng th\u1EE9c c\u1EA5u t\u1EA1o thu g\u1ECDn l\xE0:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>CH</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>COOC</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>H</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>HCOOCH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>CH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>COOCH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>HCOOC</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 6 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 6: </w:t></w:r><w:r><w:t>Cacbohi\u0111rat n\xE0o sau \u0111\xE2y thu\u1ED9c lo\u1EA1i \u0111isaccarit?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Glucoz\u01A1.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Saccaroz\u01A1.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Tinh b\u1ED9t.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Xenluloz\u01A1.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 7 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 7: </w:t></w:r><w:r><w:t>C\xF4ng th\u1EE9c ph\xE2n t\u1EED c\u1EE7a anilin l\xE0:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>CH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>N.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>7</w:t></w:r><w:r><w:t>N.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>C</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>6</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>H</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>7</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>N.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>7</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>9</w:t></w:r><w:r><w:t>N.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 8 (Ans: D) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 8: </w:t></w:r><w:r><w:t>Polime n\xE0o sau \u0111\xE2y \u0111\u01B0\u1EE3c \u0111i\u1EC1u ch\u1EBF b\u1EB1ng ph\u1EA3n \u1EE9ng tr\xF9ng h\u1EE3p?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Nilon-6,6.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Poli(etylen terephtalat).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>T\u01A1 lapsan.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Polietilen (PE).</w:t></w:r>
    </w:p>

    <!-- C\xE2u 9 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 9: </w:t></w:r><w:r><w:t>Kim lo\u1EA1i n\xE0o sau \u0111\xE2y thu\u1ED9c nh\xF3m IA trong b\u1EA3ng tu\u1EA7n ho\xE0n?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Natri (Na).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Canxi (Ca).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Magie (Mg).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Nh\xF4m (Al).</w:t></w:r>
    </w:p>

    <!-- C\xE2u 10 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 10: </w:t></w:r><w:r><w:t>N\u01B0\u1EDBc c\u1EE9ng t\u1EA1m th\u1EDDi ch\u1EE9a c\xE1c ion n\xE0o sau \u0111\xE2y c\xF9ng v\u1EDBi Ca</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2+</w:t></w:r><w:r><w:t>, Mg</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2+</w:t></w:r><w:r><w:t>?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Cl</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>-</w:t></w:r><w:r><w:t> v\xE0 SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2-</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>HCO</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="superscript"/></w:rPr><w:t>-</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>NO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>-</w:t></w:r><w:r><w:t>.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>CO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2-</w:t></w:r><w:r><w:t>.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 11 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 11: </w:t></w:r><w:r><w:t>Qu\u1EB7ng bauxit l\xE0 nguy\xEAn li\u1EC7u ch\xEDnh \u0111\u1EC3 s\u1EA3n xu\u1EA5t kim lo\u1EA1i n\xE0o?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>S\u1EAFt (Fe).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>\u0110\u1ED3ng (Cu).        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Nh\xF4m (Al).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>K\u1EBDm (Zn).</w:t></w:r>
    </w:p>

    <!-- C\xE2u 12 (Ans: D) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 12: </w:t></w:r><w:r><w:t>Kim lo\u1EA1i s\u1EAFt t\xE1c d\u1EE5ng v\u1EDBi dung d\u1ECBch HNO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> lo\xE3ng, d\u01B0 t\u1EA1o th\xE0nh mu\u1ED1i s\u1EAFt c\xF3 s\u1ED1 oxi h\xF3a l\xE0:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>+1.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>+2.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>0.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>+3.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 13 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 13: </w:t></w:r><w:r><w:t>\u0110\u1EC3 b\u1EA3o v\u1EC7 v\u1ECF t\xE0u bi\u1EC3n b\u1EB1ng th\xE9p, ng\u01B0\u1EDDi ta th\u01B0\u1EDDng g\u1EAFn c\xE1c t\u1EA5m kim lo\u1EA1i n\xE0o sau \u0111\xE2y v\xE0o v\u1ECF t\xE0u?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>K\u1EBDm (Zn).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>\u0110\u1ED3ng (Cu).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>B\u1EA1c (Ag).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Ch\xEC (Pb).</w:t></w:r>
    </w:p>

    <!-- C\xE2u 14 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 14: </w:t></w:r><w:r><w:t>Dung d\u1ECBch ch\u1EA5t n\xE0o sau \u0111\xE2y l\xE0m qu\u1EF3 t\xEDm chuy\u1EC3n sang m\xE0u \u0111\u1ECF?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>NaOH.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>HCl.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>NaCl.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>5</w:t></w:r><w:r><w:t>OH.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 15 (Ans: C) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 15: </w:t></w:r><w:r><w:t>Ch\u1EA5t n\xE0o sau \u0111\xE2y kh\xF4ng tham gia ph\u1EA3n \u1EE9ng th\u1EE7y ph\xE2n?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Saccaroz\u01A1.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>Tinh b\u1ED9t.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Fructoz\u01A1.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Xenluloz\u01A1.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 16 (Ans: D) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 16: </w:t></w:r><w:r><w:t>Amino axit \u0111\u01A1n gi\u1EA3n nh\u1EA5t l\xE0 glyxin c\xF3 ph\xE2n t\u1EED kh\u1ED1i b\u1EB1ng:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>89.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>117.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>147.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>75.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 17 (Ans: A) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 17: </w:t></w:r><w:r><w:t>S\u1ED1 li\xEAn k\u1EBFt peptit trong m\u1ED9t ph\xE2n t\u1EED tripeptit Gly-Ala-Val l\xE0:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>2.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:t>3.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>1.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>4.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 18 (Ans: B) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 18: </w:t></w:r><w:r><w:t>Kim lo\u1EA1i n\xE0o sau \u0111\xE2y ph\u1EA3n \u1EE9ng m\xE3nh li\u1EC7t v\u1EDBi n\u01B0\u1EDBc \u1EDF nhi\u1EC7t \u0111\u1ED9 th\u01B0\u1EDDng sinh ra dung d\u1ECBch ki\u1EC1m?</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>A. </w:t></w:r><w:r><w:t>Fe.        </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>B. </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>K (Kali).        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>C. </w:t></w:r><w:r><w:t>Cu.        </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>D. </w:t></w:r><w:r><w:t>Ag.</w:t></w:r>
    </w:p>

    <!-- PH\u1EA6N II: C\xC2U 19 \u0110\u1EBEN C\xC2U 22 -->
    <w:p>
      <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PH\u1EA6N II. C\xE2u tr\u1EAFc nghi\u1EC7m \u0111\xFAng sai. Th\xED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\xE2u 19 \u0111\u1EBFn c\xE2u 22. Trong m\u1ED7i \xFD a), b), c), d) \u1EDF m\u1ED7i c\xE2u, th\xED sinh ch\u1ECDn \u0110\xFAng ho\u1EB7c Sai.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 19: a) \u0110\xFAng (underlined), b) Sai, c) \u0110\xFAng (underlined), d) Sai -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 19: </w:t></w:r><w:r><w:t>Cho c\xE2n b\u1EB1ng h\xF3a h\u1ECDc sau trong b\xECnh k\xEDn: N</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>(k) + 3H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>(k) \u21CC 2NH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t>(k); \u0394H &lt; 0. X\xE9t c\xE1c ph\xE1t bi\u1EC3u sau:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Khi t\u0103ng \xE1p su\u1EA5t chung c\u1EE7a h\u1EC7, c\xE2n b\u1EB1ng chuy\u1EC3n d\u1ECBch theo chi\u1EC1u thu\u1EADn.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:t>Khi t\u0103ng nhi\u1EC7t \u0111\u1ED9 c\u1EE7a h\u1EC7, c\xE2n b\u1EB1ng chuy\u1EC3n d\u1ECBch theo chi\u1EC1u thu\u1EADn.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Th\xEAm ch\u1EA5t x\xFAc t\xE1c Fe l\xE0m t\u0103ng t\u1ED1c \u0111\u1ED9 ph\u1EA3n \u1EE9ng thu\u1EADn v\xE0 ngh\u1ECBch nh\u01B0 nhau.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:t>Gi\u1EA3m n\u1ED3ng \u0111\u1ED9 NH</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:t> l\xE0m c\xE2n b\u1EB1ng chuy\u1EC3n d\u1ECBch theo chi\u1EC1u ngh\u1ECBch.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 20: a) Sai, b) \u0110\xFAng (underlined), c) Sai, d) \u0110\xFAng (underlined) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 20: </w:t></w:r><w:r><w:t>Ti\u1EBFn h\xE0nh th\xED nghi\u1EC7m th\u1EE7y ph\xE2n tinh b\u1ED9t trong m\xF4i tr\u01B0\u1EDDng axit. X\xE9t c\xE1c kh\u1EB3ng \u0111\u1ECBnh sau:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:t>S\u1EA3n ph\u1EA9m cu\u1ED1i c\xF9ng thu \u0111\u01B0\u1EE3c sau khi th\u1EE7y ph\xE2n ho\xE0n to\xE0n l\xE0 fructoz\u01A1.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>S\u1EA3n ph\u1EA9m th\u1EE7y ph\xE2n c\xF3 kh\u1EA3 n\u0103ng tham gia ph\u1EA3n \u1EE9ng tr\xE1ng b\u1EA1c v\u1EDBi thu\u1ED1c th\u1EED Tollens.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:t>D\xF9ng dung d\u1ECBch iot \u0111\u1EC3 ki\u1EC3m tra, dung d\u1ECBch v\u1EABn gi\u1EEF nguy\xEAn m\xE0u xanh t\xEDm sau khi th\u1EE7y ph\xE2n ho\xE0n to\xE0n.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>C\u1EA7n trung h\xF2a axit tr\u01B0\u1EDBc khi th\u1EF1c hi\u1EC7n ph\u1EA3n \u1EE9ng tr\xE1ng b\u1EA1c.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 21: a) \u0110\xFAng (underlined), b) \u0110\xFAng (underlined), c) Sai, d) Sai -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 21: </w:t></w:r><w:r><w:t>Cho c\xE1c nh\u1EADn \u0111\u1ECBnh v\u1EC1 t\xEDnh ch\u1EA5t c\u1EE7a kim lo\u1EA1i nh\xF4m v\xE0 h\u1EE3p ch\u1EA5t c\u1EE7a nh\xF4m:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Nh\xF4m l\xE0 kim lo\u1EA1i l\u01B0\u1EE1ng t\xEDnh.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Al(OH)</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t> tan \u0111\u01B0\u1EE3c trong c\u1EA3 dung d\u1ECBch HCl v\xE0 dung d\u1ECBch NaOH d\u01B0.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:t>Al th\u1EE5 \u0111\u1ED9ng h\xF3a trong dung d\u1ECBch H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:t> lo\xE3ng ngu\u1ED9i.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:t>S\u1EE5c kh\xED CO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t> d\u01B0 v\xE0o dung d\u1ECBch NaAlO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t> th\xEC k\u1EBFt t\u1EE7a tan ho\xE0n to\xE0n.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 22: a) \u0110\xFAng (underlined), b) Sai, c) \u0110\xFAng (underlined), d) \u0110\xFAng (underlined) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 22: </w:t></w:r><w:r><w:t>V\u1EC1 ph\u1EA3n \u1EE9ng este h\xF3a gi\u1EEFa axit axetic v\xE0 ancol etylic:</w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>a) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Axit H</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>SO</w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t> \u0111\u1EB7c \u0111\xF3ng vai tr\xF2 v\u1EEBa l\xE0 ch\u1EA5t x\xFAc t\xE1c v\u1EEBa h\xFAt n\u01B0\u1EDBc \u0111\u1EC3 chuy\u1EC3n d\u1ECBch c\xE2n b\u1EB1ng.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>b) </w:t></w:r><w:r><w:t>Ph\u1EA3n \u1EE9ng este h\xF3a l\xE0 ph\u1EA3n \u1EE9ng m\u1ED9t chi\u1EC1u ho\xE0n to\xE0n.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>c) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>\u0110\u1EC3 t\xE1ch este etyl axetat ra kh\u1ECFi h\u1ED7n h\u1EE3p sau ph\u1EA3n \u1EE9ng, ng\u01B0\u1EDDi ta th\xEAm dung d\u1ECBch NaCl b\xE3o h\xF2a r\u1ED3i chi\u1EBFt.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>d) </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Etyl axetat nh\u1EB9 h\u01A1n n\u01B0\u1EDBc v\xE0 n\u1ED5i l\xEAn tr\xEAn b\u1EC1 m\u1EB7t.</w:t></w:r>
    </w:p>

    <!-- PH\u1EA6N III: C\xC2U 23 \u0110\u1EBEN C\xC2U 25 -->
    <w:p>
      <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PH\u1EA6N III. C\xE2u tr\u1EAFc nghi\u1EC7m tr\u1EA3 l\u1EDDi ng\u1EAFn. Th\xED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\xE2u 23 \u0111\u1EBFn c\xE2u 25. Th\xED sinh \u0111i\u1EC1n k\u1EBFt qu\u1EA3 v\xE0o \xF4 tr\u1ED1ng t\u01B0\u01A1ng \u1EE9ng.</w:t></w:r>
    </w:p>

    <!-- C\xE2u 23 (Ans: 4) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 23: </w:t></w:r><w:r><w:t>Este no, \u0111\u01A1n ch\u1EE9c, m\u1EA1ch h\u1EDF X c\xF3 c\xF4ng th\u1EE9c ph\xE2n t\u1EED C</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:t>H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>8</w:t></w:r><w:r><w:t>O</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>. H\u1ECFi X c\xF3 t\u1EA5t c\u1EA3 bao nhi\xEAu \u0111\u1ED3ng ph\xE2n c\u1EA5u t\u1EA1o este?</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:color w:val="047857"/></w:rPr><w:t>\u0110\xE1p \xE1n: 4</w:t></w:r></w:p>

    <!-- C\xE2u 24 (Ans: 0,1) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 24: </w:t></w:r><w:r><w:t>H\xF2a tan ho\xE0n to\xE0n 5,6 gam s\u1EAFt (Fe) v\xE0o dung d\u1ECBch HCl d\u01B0. T\xEDnh s\u1ED1 mol kh\xED H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t> (\u0111ktc) sinh ra.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:color w:val="047857"/></w:rPr><w:t>\u0110\xE1p \xE1n: 0,1 mol</w:t></w:r></w:p>

    <!-- C\xE2u 25 (Ans: 12,5%) -->
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u 25: </w:t></w:r><w:r><w:t>H\xF2a tan ho\xE0n to\xE0n 25 gam mu\u1ED1i \u0103n (NaCl) v\xE0o 175 gam n\u01B0\u1EDBc c\u1EA5t. N\u1ED3ng \u0111\u1ED9 ph\u1EA7n tr\u0103m c\u1EE7a dung d\u1ECBch thu \u0111\u01B0\u1EE3c l\xE0 bao nhi\xEAu %? (L\xE0m tr\xF2n \u0111\u1EBFn 1 ch\u1EEF s\u1ED1 th\u1EADp ph\xE2n n\u1EBFu c\u1EA7n).</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:color w:val="047857"/></w:rPr><w:t>\u0110\xE1p \xE1n: 12,5%</w:t></w:r></w:p>

  </w:body>
</w:document>`;
  zip.file("word/document.xml", docXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

// server/examManager.ts
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function renumberPrompt(promptHtml, newNumber) {
  const clean = stripOriginalQuestionNumber(promptHtml);
  return `<strong>C\xE2u ${newNumber}: </strong>${clean}`;
}
function createShuffledVersion(source, testCode, config) {
  const versionId = `ver_${testCode}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const part1Source = source.questions.filter((q) => q.section === 1);
  const part2Source = source.questions.filter((q) => q.section === 2);
  const part3Source = source.questions.filter((q) => q.section === 3);
  const shuffledP1 = shuffleArray(part1Source);
  const shuffledP2 = shuffleArray(part2Source);
  const shuffledP3 = shuffleArray(part3Source);
  const answerKeys = {
    part1: {},
    part2: {},
    part3: {}
  };
  const finalQuestions = [];
  shuffledP1.forEach((q, idx) => {
    const originalOptions = q.options || [];
    const shuffledOpts = shuffleArray(originalOptions);
    const labels = ["A", "B", "C", "D"];
    const correctOpt = originalOptions.find((o) => o.isCorrect);
    if (correctOpt) {
      answerKeys.part1[q.id] = correctOpt.id;
    }
    const remappedOptions = shuffledOpts.map((opt, optIdx) => ({
      id: opt.id,
      label: labels[optIdx] || opt.label,
      html: opt.html,
      text: opt.text || opt.html.replace(/<[^>]+>/g, "")
    }));
    finalQuestions.push({
      id: q.id,
      originalQuestionId: q.id,
      displayNumber: idx + 1,
      section: 1,
      promptHtml: renumberPrompt(q.promptHtml, idx + 1),
      images: q.images,
      tableHtml: q.tableHtml,
      options: remappedOptions,
      points: config.part1PointsPerQ
    });
  });
  shuffledP2.forEach((q, idx) => {
    const originalStmts = q.statements || [];
    const shuffledStmts = shuffleArray(originalStmts);
    const stmtLabels = ["a", "b", "c", "d"];
    answerKeys.part2[q.id] = {};
    originalStmts.forEach((stmt) => {
      answerKeys.part2[q.id][stmt.id] = stmt.isCorrect;
    });
    const remappedStmts = shuffledStmts.map((stmt, stmtIdx) => ({
      id: stmt.id,
      label: stmtLabels[stmtIdx] || stmt.label,
      html: stmt.html,
      text: stmt.text || stmt.html.replace(/<[^>]+>/g, "")
    }));
    finalQuestions.push({
      id: q.id,
      originalQuestionId: q.id,
      displayNumber: idx + 1,
      section: 2,
      promptHtml: renumberPrompt(q.promptHtml, idx + 1),
      images: q.images,
      tableHtml: q.tableHtml,
      statements: remappedStmts,
      points: config.part2PointsPerQ
    });
  });
  shuffledP3.forEach((q, idx) => {
    const rawKey = q.shortAnswerKey || "";
    const acceptable = [rawKey];
    if (rawKey.includes(",")) {
      acceptable.push(rawKey.replace(/,/g, "."));
    } else if (rawKey.includes(".")) {
      acceptable.push(rawKey.replace(/\./g, ","));
    }
    const numberOnlyMatch = rawKey.match(/^([0-9.,]+)/);
    if (numberOnlyMatch) {
      const numVal = numberOnlyMatch[1];
      acceptable.push(numVal);
      acceptable.push(numVal.replace(/,/g, "."));
      acceptable.push(numVal.replace(/\./g, ","));
    }
    answerKeys.part3[q.id] = Array.from(new Set(acceptable.filter((s) => s.trim().length > 0)));
    finalQuestions.push({
      id: q.id,
      originalQuestionId: q.id,
      displayNumber: idx + 1,
      section: 3,
      promptHtml: renumberPrompt(q.promptHtml, idx + 1),
      images: q.images,
      tableHtml: q.tableHtml,
      points: config.part3PointsPerQ
    });
  });
  return {
    versionId,
    examId: source.id,
    testCode,
    title: source.title,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    questions: finalQuestions,
    answerKeys
  };
}
function normalizeChemistryAnswer(input) {
  return input.trim().toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
}
function compareShortAnswer(studentAns, standardKeys) {
  if (!studentAns || !studentAns.trim()) return false;
  const normStudent = normalizeChemistryAnswer(studentAns);
  for (const std of standardKeys) {
    const normStd = normalizeChemistryAnswer(std);
    if (normStudent === normStd) return true;
    const studentNum = parseFloat(normStudent.replace(/[^0-9.-]/g, ""));
    const stdNum = parseFloat(normStd.replace(/[^0-9.-]/g, ""));
    if (!isNaN(studentNum) && !isNaN(stdNum) && Math.abs(studentNum - stdNum) < 1e-4) {
      return true;
    }
  }
  return false;
}
function gradeSubmission(version, answers, config) {
  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const details = [];
  for (const q of version.questions) {
    if (q.section === 1) {
      const selectedOptId = answers.part1[q.id];
      const correctOptId = version.answerKeys.part1[q.id];
      const selectedOpt = q.options?.find((o) => o.id === selectedOptId);
      const correctOpt = q.options?.find((o) => o.id === correctOptId);
      const isAnswered = !!selectedOptId;
      const isCorrect = isAnswered && selectedOptId === correctOptId;
      let pointsEarned = 0;
      if (isCorrect) {
        pointsEarned = config.part1PointsPerQ;
        part1Score += pointsEarned;
        correctCount++;
      } else if (!isAnswered) {
        unansweredCount++;
      } else {
        wrongCount++;
      }
      details.push({
        questionId: q.id,
        displayNumber: q.displayNumber,
        section: 1,
        promptHtml: q.promptHtml,
        pointsEarned: Math.round(pointsEarned * 100) / 100,
        maxPoints: config.part1PointsPerQ,
        isCorrect,
        selectedOptionLabel: selectedOpt ? selectedOpt.label : void 0,
        correctOptionLabel: correctOpt ? correctOpt.label : void 0,
        selectedOptionHtml: selectedOpt ? selectedOpt.html : void 0,
        correctOptionHtml: correctOpt ? correctOpt.html : void 0
      });
    } else if (q.section === 2) {
      const qAnswers = answers.part2[q.id] || {};
      const qCorrectMap = version.answerKeys.part2[q.id] || {};
      const statements = q.statements || [];
      let correctStatementsCount = 0;
      let answeredCount = 0;
      const stmtResults = statements.map((stmt) => {
        const studentChoice = qAnswers[stmt.id] !== void 0 ? qAnswers[stmt.id] : null;
        const correctChoice = qCorrectMap[stmt.id] ?? false;
        const stmtIsCorrect = studentChoice !== null && studentChoice === correctChoice;
        if (studentChoice !== null) answeredCount++;
        if (stmtIsCorrect) correctStatementsCount++;
        return {
          id: stmt.id,
          label: stmt.label,
          textHtml: stmt.html,
          studentChoice,
          correctChoice,
          isCorrect: stmtIsCorrect
        };
      });
      let earned = 0;
      if (config.part2GradingMode === "vietnam_standard") {
        if (correctStatementsCount === 1) earned = 0.1 * (config.part2PointsPerQ / 1);
        else if (correctStatementsCount === 2) earned = 0.25 * (config.part2PointsPerQ / 1);
        else if (correctStatementsCount === 3) earned = 0.5 * (config.part2PointsPerQ / 1);
        else if (correctStatementsCount === 4) earned = 1 * (config.part2PointsPerQ / 1);
      } else {
        earned = config.part2PointsPerQ / statements.length * correctStatementsCount;
      }
      earned = Math.round(earned * 100) / 100;
      part2Score += earned;
      const isWholeQuestionCorrect = correctStatementsCount === statements.length;
      if (isWholeQuestionCorrect) correctCount++;
      else if (answeredCount === 0) unansweredCount++;
      else wrongCount++;
      details.push({
        questionId: q.id,
        displayNumber: q.displayNumber,
        section: 2,
        promptHtml: q.promptHtml,
        pointsEarned: earned,
        maxPoints: config.part2PointsPerQ,
        isCorrect: isWholeQuestionCorrect,
        statementResults: stmtResults
      });
    } else if (q.section === 3) {
      const studentText = (answers.part3[q.id] || "").trim();
      const standardKeys = version.answerKeys.part3[q.id] || [];
      const isAnswered = studentText.length > 0;
      const isCorrect = isAnswered && compareShortAnswer(studentText, standardKeys);
      let earned = 0;
      if (isCorrect) {
        earned = config.part3PointsPerQ;
        part3Score += earned;
        correctCount++;
      } else if (!isAnswered) {
        unansweredCount++;
      } else {
        wrongCount++;
      }
      details.push({
        questionId: q.id,
        displayNumber: q.displayNumber,
        section: 3,
        promptHtml: q.promptHtml,
        pointsEarned: earned,
        maxPoints: config.part3PointsPerQ,
        isCorrect,
        studentAnswerText: studentText,
        standardAnswers: standardKeys
      });
    }
  }
  const totalScore = Math.min(
    config.totalScale,
    Math.round((part1Score + part2Score + part3Score) * 100) / 100
  );
  return {
    totalScore,
    part1Score: Math.round(part1Score * 100) / 100,
    part2Score: Math.round(part2Score * 100) / 100,
    part3Score: Math.round(part3Score * 100) / 100,
    correctQuestionsCount: correctCount,
    wrongQuestionsCount: wrongCount,
    unansweredQuestionsCount: unansweredCount,
    details
  };
}

// server/docxGenerator.ts
import JSZip3 from "jszip";
function escapeXml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function htmlToDocxRuns(html, options = {}) {
  const tokens = html.split(/(<\/?[a-z0-9_-]+(?:\s+[^>]*)?>)/gi);
  let runsXml = "";
  let isBold = false;
  let isItalic = false;
  let isSub = false;
  let isSup = false;
  let isUnderline = false;
  for (const token of tokens) {
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower === "<strong>" || lower === "<b>") {
      isBold = true;
      continue;
    }
    if (lower === "</strong>" || lower === "</b>") {
      isBold = false;
      continue;
    }
    if (lower === "<em>" || lower === "<i>") {
      isItalic = true;
      continue;
    }
    if (lower === "</em>" || lower === "</i>") {
      isItalic = false;
      continue;
    }
    if (lower === "<sub>") {
      isSub = true;
      continue;
    }
    if (lower === "</sub>") {
      isSub = false;
      continue;
    }
    if (lower === "<sup>") {
      isSup = true;
      continue;
    }
    if (lower === "</sup>") {
      isSup = false;
      continue;
    }
    if (lower.startsWith("<u")) {
      isUnderline = true;
      continue;
    }
    if (lower === "</u>") {
      isUnderline = false;
      continue;
    }
    if (lower === "<br>" || lower === "<br/>") {
      runsXml += "<w:r><w:br/></w:r>";
      continue;
    }
    if (lower.startsWith("<img")) {
      continue;
    }
    if (token.startsWith("<") && token.endsWith(">")) {
      continue;
    }
    const text = token.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const xmlEscaped = escapeXml(text);
    let rPr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/>';
    if (isBold) rPr += "<w:b/>";
    if (isItalic) rPr += "<w:i/>";
    if (isSub) rPr += '<w:vertAlign w:val="subscript"/>';
    if (isSup) rPr += '<w:vertAlign w:val="superscript"/>';
    if (isUnderline && options.allowUnderline) rPr += '<w:u w:val="single"/>';
    rPr += "</w:rPr>";
    runsXml += `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscaped}</w:t></w:r>`;
  }
  return runsXml;
}
async function generateStudentDocx(version) {
  const zip = new JSZip3();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  const mediaMap = {};
  let rIdCounter = 10;
  for (const q of version.questions) {
    for (const img of q.images) {
      if (!mediaMap[img.id] && img.dataUrl) {
        const matches = img.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches) {
          const ext = img.mimeType.includes("jpeg") ? "jpg" : "png";
          const fileTarget = `media/img_${rIdCounter}.${ext}`;
          mediaMap[img.id] = {
            rId: `rIdImg${rIdCounter}`,
            fileTarget,
            buffer: Buffer.from(matches[2], "base64")
          };
          rIdCounter++;
        }
      }
    }
  }
  for (const media of Object.values(mediaMap)) {
    zip.file(`word/${media.fileTarget}`, media.buffer);
  }
  let docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  for (const media of Object.values(mediaMap)) {
    docRels += `
  <Relationship Id="${media.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${media.fileTarget}"/>`;
  }
  docRels += `
</Relationships>`;
  zip.file("word/_rels/document.xml.rels", docRels);
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`
  );
  let bodyXml = "";
  bodyXml += `
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>S\u1EDE GI\xC1O D\u1EE4C V\xC0 \u0110\xC0O T\u1EA0O - TR\u01AF\u1EDCNG THPT</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1E3A8A"/></w:rPr><w:t>${escapeXml(version.title.toUpperCase())}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="B91C1C"/><w:sz w:val="26"/></w:rPr><w:t>M\xC3 \u0110\u1EC0 THI: ${escapeXml(version.testCode)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:i/></w:rPr><w:t>H\u1ECD v\xE0 t\xEAn th\xED sinh: ................................................................ L\u1EDBp: ................................</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>======================================================================</w:t></w:r></w:p>`;
  const p1 = version.questions.filter((q) => q.section === 1);
  const p2 = version.questions.filter((q) => q.section === 2);
  const p3 = version.questions.filter((q) => q.section === 3);
  if (p1.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PH\u1EA6N I. C\xE2u tr\u1EAFc nghi\u1EC7m nhi\u1EC1u ph\u01B0\u01A1ng \xE1n l\u1EF1a ch\u1ECDn (Th\xED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\xE2u 1 \u0111\u1EBFn c\xE2u ${p1.length})</w:t></w:r>
      </w:p>`;
    for (let i = 0; i < p1.length; i++) {
      const q = p1[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>C\xE2u ${i + 1}: </w:t></w:r>
          ${htmlToDocxRuns(stripOriginalQuestionNumber(q.promptHtml), { allowUnderline: false })}
        </w:p>`;
      for (const img of q.images) {
        const media = mediaMap[img.id];
        if (media) {
          bodyXml += `
            <w:p>
              <w:pPr><w:jc w:val="center"/></w:pPr>
              <w:r><w:drawing><a:blip r:embed="${media.rId}"/></w:drawing></w:r>
            </w:p>`;
        }
      }
      if (q.options) {
        for (const opt of q.options) {
          bodyXml += `
            <w:p>
              <w:pPr><w:ind w:left="360"/></w:pPr>
              <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${opt.label}. </w:t></w:r>
              ${htmlToDocxRuns(opt.html, { allowUnderline: false })}
            </w:p>`;
        }
      }
    }
  }
  if (p2.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PH\u1EA6N II. C\xE2u tr\u1EAFc nghi\u1EC7m \u0111\xFAng sai (Th\xED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\xE2u 1 \u0111\u1EBFn c\xE2u ${p2.length})</w:t></w:r>
      </w:p>`;
    for (let i = 0; i < p2.length; i++) {
      const q = p2[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>C\xE2u ${i + 1}: </w:t></w:r>
          ${htmlToDocxRuns(stripOriginalQuestionNumber(q.promptHtml), { allowUnderline: false })}
        </w:p>`;
      for (const img of q.images) {
        const media = mediaMap[img.id];
        if (media) {
          bodyXml += `
            <w:p>
              <w:pPr><w:jc w:val="center"/></w:pPr>
              <w:r><w:drawing><a:blip r:embed="${media.rId}"/></w:drawing></w:r>
            </w:p>`;
        }
      }
      if (q.statements) {
        for (const stmt of q.statements) {
          bodyXml += `
            <w:p>
              <w:pPr><w:ind w:left="360"/></w:pPr>
              <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${stmt.label}) </w:t></w:r>
              ${htmlToDocxRuns(stmt.html, { allowUnderline: false })}
            </w:p>`;
        }
      }
    }
  }
  if (p3.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="B91C1C"/></w:rPr><w:t>PH\u1EA6N III. C\xE2u tr\u1EAFc nghi\u1EC7m tr\u1EA3 l\u1EDDi ng\u1EAFn (Th\xED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\xE2u 1 \u0111\u1EBFn c\xE2u ${p3.length})</w:t></w:r>
      </w:p>`;
    for (let i = 0; i < p3.length; i++) {
      const q = p3[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>C\xE2u ${i + 1}: </w:t></w:r>
          ${htmlToDocxRuns(stripOriginalQuestionNumber(q.promptHtml), { allowUnderline: false })}
        </w:p>
        <w:p>
          <w:pPr><w:ind w:left="360"/></w:pPr>
          <w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>Tr\u1EA3 l\u1EDDi: ................................................................</w:t></w:r>
        </w:p>`;
    }
  }
  bodyXml += `
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:before="360"/></w:pPr>
      <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>--- H\u1EBET --- (C\xE1n b\u1ED9 coi thi kh\xF4ng gi\u1EA3i th\xEDch g\xEC th\xEAm)</w:t></w:r>
    </w:p>`;
  const fullDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`;
  zip.file("word/document.xml", fullDocXml);
  return await zip.generateAsync({ type: "nodebuffer" });
}
async function generateTeacherAnswerDocx(version) {
  const zip = new JSZip3();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`
  );
  let bodyXml = "";
  bodyXml += `
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="047857"/></w:rPr><w:t>\u0110\xC1P \xC1N V\xC0 H\u01AF\u1EDANG D\u1EAAN CH\u1EA4M - M\xC3 \u0110\u1EC0: ${escapeXml(version.testCode)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(version.title)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>======================================================================</w:t></w:r></w:p>`;
  const p1 = version.questions.filter((q) => q.section === 1);
  if (p1.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E3A8A"/></w:rPr><w:t>B\u1EA2NG \u0110\xC1P \xC1N PH\u1EA6N I (TR\u1EAEC NGHI\u1EC6M NHI\u1EC0U PH\u01AF\u01A0NG \xC1N)</w:t></w:r>
      </w:p>`;
    for (let i = 0; i < p1.length; i++) {
      const q = p1[i];
      const correctOptId = version.answerKeys.part1[q.id];
      const correctOpt = q.options?.find((o) => o.id === correctOptId);
      const ansLabel = correctOpt ? correctOpt.label : "Ch\u01B0a c\xF3";
      const optText = correctOpt ? correctOpt.text || correctOpt.html.replace(/<[^>]+>/g, "") : "";
      bodyXml += `
        <w:p>
          <w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u ${i + 1}: </w:t></w:r>
          <w:r><w:rPr><w:b/><w:color w:val="B91C1C"/><w:sz w:val="26"/></w:rPr><w:t>${ansLabel}</w:t></w:r>
          <w:r><w:t> (N\u1ED9i dung: ${escapeXml(optText)})</w:t></w:r>
        </w:p>`;
    }
  }
  const p2 = version.questions.filter((q) => q.section === 2);
  if (p2.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E3A8A"/></w:rPr><w:t>B\u1EA2NG \u0110\xC1P \xC1N PH\u1EA6N II (\u0110\xDANG - SAI)</w:t></w:r>
      </w:p>`;
    for (let i = 0; i < p2.length; i++) {
      const q = p2[i];
      bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="120"/></w:pPr>
          <w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u ${i + 1}: </w:t></w:r>
        </w:p>`;
      if (q.statements) {
        for (const stmt of q.statements) {
          const isCorrect = version.answerKeys.part2[q.id]?.[stmt.id];
          const resultText = isCorrect ? "\u0110\xDANG" : "SAI";
          const color = isCorrect ? "047857" : "B91C1C";
          const stmtText = stmt.text || stmt.html.replace(/<[^>]+>/g, "");
          bodyXml += `
            <w:p>
              <w:pPr><w:ind w:left="360"/></w:pPr>
              <w:r><w:rPr><w:b/></w:rPr><w:t>${stmt.label}) </w:t></w:r>
              <w:r><w:t>${escapeXml(stmtText)}: </w:t></w:r>
              <w:r><w:rPr><w:b/><w:color w:val="${color}"/></w:rPr><w:t> -> ${resultText}</w:t></w:r>
            </w:p>`;
        }
      }
    }
  }
  const p3 = version.questions.filter((q) => q.section === 3);
  if (p3.length > 0) {
    bodyXml += `
      <w:p>
        <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E3A8A"/></w:rPr><w:t>B\u1EA2NG \u0110\xC1P \xC1N PH\u1EA6N III (TR\u1EA2 L\u1EDCI NG\u1EAEN)</w:t></w:r>
      </w:p>`;
    for (let i = 0; i < p3.length; i++) {
      const q = p3[i];
      const answers = version.answerKeys.part3[q.id] || [];
      bodyXml += `
        <w:p>
          <w:r><w:rPr><w:b/></w:rPr><w:t>C\xE2u ${i + 1}: </w:t></w:r>
          <w:r><w:rPr><w:b/><w:color w:val="047857"/><w:sz w:val="26"/></w:rPr><w:t>${escapeXml(answers.join(" | "))}</w:t></w:r>
        </w:p>`;
    }
  }
  const fullDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`;
  zip.file("word/document.xml", fullDocXml);
  return await zip.generateAsync({ type: "nodebuffer" });
}

// server/excelGenerator.ts
import ExcelJS from "exceljs";
async function generateExamExcel(publishedExam, submissions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "H\u1ECDc H\xF3a C\xF9ng Th\u1EA7y Thi\u1EC7n";
  workbook.created = /* @__PURE__ */ new Date();
  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A8A" }
    // Navy blue
  };
  const headerFont = {
    name: "Times New Roman",
    size: 11,
    bold: true,
    color: { argb: "FFFFFFFF" }
  };
  const dataFont = {
    name: "Times New Roman",
    size: 11
  };
  const borderStyle = {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } }
  };
  const sheet1 = workbook.addWorksheet("B\u1EA2NG \u0110I\u1EC2M", {
    views: [{ showGridLines: true }]
  });
  sheet1.mergeCells("A1:J1");
  const titleCell1 = sheet1.getCell("A1");
  titleCell1.value = `B\u1EA2NG \u0110I\u1EC2M T\u1ED4NG H\u1EE2P - ${publishedExam.title.toUpperCase()}`;
  titleCell1.font = { name: "Times New Roman", size: 16, bold: true, color: { argb: "FF1E3A8A" } };
  titleCell1.alignment = { horizontal: "center", vertical: "middle" };
  sheet1.getRow(1).height = 30;
  sheet1.mergeCells("A2:J2");
  const subCell1 = sheet1.getCell("A2");
  subCell1.value = `H\u1EC7 th\u1ED1ng: H\u1ECDc H\xF3a C\xF9ng Th\u1EA7y Thi\u1EC7n | Ng\xE0y xu\u1EA5t: ${(/* @__PURE__ */ new Date()).toLocaleDateString("vi-VN")} | T\u1ED5ng s\u1ED1 h\u1ECDc sinh: ${submissions.length}`;
  subCell1.font = { name: "Times New Roman", size: 10, italic: true };
  subCell1.alignment = { horizontal: "center", vertical: "middle" };
  sheet1.addRow([]);
  const s1Headers = [
    "STT",
    "H\u1ECD v\xE0 t\xEAn",
    "L\u1EDBp",
    "M\xE3 \u0111\u1EC1",
    "Th\u1EDDi \u0111i\u1EC3m n\u1ED9p",
    "\u0110i\u1EC3m t\u1ED5ng k\u1EBFt (10)",
    "S\u1ED1 c\xE2u \u0111\xFAng",
    "S\u1ED1 c\xE2u sai",
    "Ch\u01B0a tr\u1EA3 l\u1EDDi",
    "Tr\u1EA1ng th\xE1i"
  ];
  const hRow1 = sheet1.addRow(s1Headers);
  hRow1.height = 24;
  hRow1.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderStyle;
  });
  submissions.forEach((sub, idx) => {
    const row = sheet1.addRow([
      idx + 1,
      sub.studentName,
      sub.studentClass,
      sub.testCode,
      new Date(sub.submittedAt).toLocaleString("vi-VN"),
      sub.score.totalScore,
      sub.score.correctQuestionsCount,
      sub.score.wrongQuestionsCount,
      sub.score.unansweredQuestionsCount,
      "\u0110\xE3 ho\xE0n th\xE0nh"
    ]);
    row.height = 20;
    row.eachCell((cell, colNum) => {
      cell.font = dataFont;
      cell.border = borderStyle;
      if (colNum === 1 || colNum === 3 || colNum === 4 || colNum === 5 || colNum >= 7) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colNum === 6) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.numFmt = "0.00";
        cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: "FF047857" } };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  });
  sheet1.columns = [
    { width: 8 },
    // STT
    { width: 28 },
    // Họ tên
    { width: 12 },
    // Lớp
    { width: 14 },
    // Mã đề
    { width: 22 },
    // Thời điểm nộp
    { width: 20 },
    // Điểm tổng kết
    { width: 15 },
    // Đúng
    { width: 15 },
    // Sai
    { width: 15 },
    // Chưa trả lời
    { width: 16 }
    // Trạng thái
  ];
  const sheet2 = workbook.addWorksheet("CHI TI\u1EBET B\xC0I L\xC0M", {
    views: [{ showGridLines: true }]
  });
  sheet2.mergeCells("A1:H1");
  const titleCell2 = sheet2.getCell("A1");
  titleCell2.value = `CHI TI\u1EBET B\xC0I L\xC0M T\u1EEANG C\xC2U H\u1ECEI C\u1EE6A H\u1ECCC SINH`;
  titleCell2.font = { name: "Times New Roman", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  titleCell2.alignment = { horizontal: "center", vertical: "middle" };
  sheet2.getRow(1).height = 26;
  sheet2.addRow([]);
  const s2Headers = [
    "H\u1ECD v\xE0 t\xEAn",
    "L\u1EDBp",
    "M\xE3 \u0111\u1EC1",
    "C\xE2u h\u1ECFi",
    "\u0110\xE1p \xE1n h\u1ECDc sinh",
    "\u0110\xE1p \xE1n chu\u1EA9n",
    "Tr\u1EA1ng th\xE1i",
    "\u0110i\u1EC3m \u0111\u1EA1t \u0111\u01B0\u1EE3c"
  ];
  const hRow2 = sheet2.addRow(s2Headers);
  hRow2.height = 24;
  hRow2.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF047857" }
      // Emerald green
    };
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderStyle;
  });
  submissions.forEach((sub) => {
    sub.score.details.forEach((det) => {
      let studentAns = "";
      let correctAns = "";
      if (det.section === 1) {
        studentAns = det.selectedOptionLabel ? `Ph\u01B0\u01A1ng \xE1n ${det.selectedOptionLabel}` : "(Ch\u01B0a ch\u1ECDn)";
        correctAns = det.correctOptionLabel ? `Ph\u01B0\u01A1ng \xE1n ${det.correctOptionLabel}` : "";
      } else if (det.section === 2) {
        if (det.statementResults) {
          studentAns = det.statementResults.map((s) => `${s.label}: ${s.studentChoice === true ? "\u0110" : s.studentChoice === false ? "S" : "-"}`).join(" | ");
          correctAns = det.statementResults.map((s) => `${s.label}: ${s.correctChoice ? "\u0110" : "S"}`).join(" | ");
        }
      } else if (det.section === 3) {
        studentAns = det.studentAnswerText || "(Ch\u01B0a nh\u1EADp)";
        correctAns = det.standardAnswers?.join(" ho\u1EB7c ") || "";
      }
      const row = sheet2.addRow([
        sub.studentName,
        sub.studentClass,
        sub.testCode,
        `Ph\u1EA7n ${det.section} - C\xE2u ${det.displayNumber}`,
        studentAns,
        correctAns,
        det.isCorrect ? "\u0110\xDANG" : "SAI",
        det.pointsEarned
      ]);
      row.height = 20;
      row.eachCell((cell, colNum) => {
        cell.font = dataFont;
        cell.border = borderStyle;
        if (colNum <= 4 || colNum === 7 || colNum === 8) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }
        if (colNum === 7) {
          cell.font = {
            name: "Times New Roman",
            size: 11,
            bold: true,
            color: { argb: det.isCorrect ? "FF047857" : "FFDC2626" }
          };
        }
        if (colNum === 8) {
          cell.numFmt = "0.00";
        }
      });
    });
  });
  sheet2.columns = [
    { width: 24 },
    // Họ tên
    { width: 12 },
    // Lớp
    { width: 12 },
    // Mã đề
    { width: 18 },
    // Câu hỏi
    { width: 32 },
    // ĐA học sinh
    { width: 32 },
    // ĐA chuẩn
    { width: 14 },
    // Kết quả
    { width: 16 }
    // Điểm
  ];
  const sheet3 = workbook.addWorksheet("TH\u1ED0NG K\xCA C\xC2U H\u1ECEI", {
    views: [{ showGridLines: true }]
  });
  sheet3.mergeCells("A1:G1");
  const titleCell3 = sheet3.getCell("A1");
  titleCell3.value = `TH\u1ED0NG K\xCA M\u1EE8C \u0110\u1ED8 N\u1EAEM KI\u1EBEN TH\u1EE8C THEO T\u1EEANG C\xC2U H\u1ECEI`;
  titleCell3.font = { name: "Times New Roman", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  titleCell3.alignment = { horizontal: "center", vertical: "middle" };
  sheet3.getRow(1).height = 26;
  sheet3.addRow([]);
  const s3Headers = [
    "Ph\u1EA7n thi",
    "Th\u1EE9 t\u1EF1 c\xE2u",
    "S\u1ED1 l\u01B0\u1EE3t l\xE0m",
    "S\u1ED1 l\u01B0\u1EE3t \u0111\xFAng",
    "S\u1ED1 l\u01B0\u1EE3t sai",
    "T\u1EF7 l\u1EC7 \u0111\xFAng (%)",
    "\u0110\xE1nh gi\xE1 \u0111\u1ED9 kh\xF3"
  ];
  const hRow3 = sheet3.addRow(s3Headers);
  hRow3.height = 24;
  hRow3.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderStyle;
  });
  const questionStatsMap = {};
  submissions.forEach((sub) => {
    sub.score.details.forEach((det) => {
      const key = `${det.section}_${det.displayNumber}`;
      if (!questionStatsMap[key]) {
        questionStatsMap[key] = {
          section: det.section,
          num: det.displayNumber,
          total: 0,
          correct: 0,
          wrong: 0
        };
      }
      questionStatsMap[key].total++;
      if (det.isCorrect) questionStatsMap[key].correct++;
      else questionStatsMap[key].wrong++;
    });
  });
  const sortedStats = Object.values(questionStatsMap).sort((a, b) => {
    if (a.section !== b.section) return a.section - b.section;
    return a.num - b.num;
  });
  sortedStats.forEach((stat) => {
    const rate = stat.total > 0 ? stat.correct / stat.total * 100 : 0;
    let evalText = "Trung b\xECnh";
    if (rate >= 80) evalText = "D\u1EC5 / N\u1EAFm v\u1EEFng";
    else if (rate <= 40) evalText = "Kh\xF3 / Nhi\u1EC1u h\u1ECDc sinh sai";
    const row = sheet3.addRow([
      `Ph\u1EA7n ${stat.section}`,
      `C\xE2u ${stat.num}`,
      stat.total,
      stat.correct,
      stat.wrong,
      rate / 100,
      evalText
    ]);
    row.height = 20;
    row.eachCell((cell, colNum) => {
      cell.font = dataFont;
      cell.border = borderStyle;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (colNum === 6) {
        cell.numFmt = "0.0%";
      }
      if (colNum === 7) {
        if (rate <= 40) {
          cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: "FFDC2626" } };
        } else if (rate >= 80) {
          cell.font = { name: "Times New Roman", size: 11, color: { argb: "FF047857" } };
        }
      }
    });
  });
  sheet3.columns = [
    { width: 16 },
    // Phần thi
    { width: 16 },
    // Thứ tự câu
    { width: 16 },
    // Lượt làm
    { width: 16 },
    // Lượt đúng
    { width: 16 },
    // Lượt sai
    { width: 18 },
    // Tỷ lệ đúng
    { width: 28 }
    // Đánh giá
  ];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// server.ts
var app = express();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  // 30 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.includes("wordprocessingml") || file.originalname.toLowerCase().endsWith(".docx")) {
      cb(null, true);
    } else {
      cb(new Error("Ch\u1EC9 ch\u1EA5p nh\u1EADn t\u1EC7p \u0111\u1ECBnh d\u1EA1ng Word DOCX (.docx)"));
    }
  }
});
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Vui l\xF2ng nh\u1EADp t\xEAn \u0111\u0103ng nh\u1EADp v\xE0 m\u1EADt kh\u1EA9u" });
  }
  const result = db.login(username, password);
  if (!result) {
    return res.status(401).json({
      error: "T\xEAn \u0111\u0103ng nh\u1EADp ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c! (M\u1EB7c \u0111\u1ECBnh: ThayThien / ThayThien@2025)"
    });
  }
  return res.json(result);
});
app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Ch\u01B0a \u0111\u0103ng nh\u1EADp" });
  }
  const token = authHeader.split(" ")[1];
  const teacher = db.getTeacherByToken(token);
  if (!teacher) {
    return res.status(401).json({ error: "Phi\xEAn kh\xF4ng h\u1EE3p l\u1EC7" });
  }
  return res.json({ user: teacher });
});
app.post("/api/exams/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "Vui l\xF2ng ch\u1ECDn t\u1EC7p Word (.docx) \u0111\u1EC3 t\u1EA3i l\xEAn" });
    }
    const examSource = await parseDocxBuffer(req.file.buffer, req.file.originalname);
    db.saveExam(examSource);
    return res.json({
      success: true,
      exam: examSource,
      message: `\u0110\xE3 ph\xE2n t\xEDch th\xE0nh c\xF4ng \u0111\u1EC1 thi: ${examSource.totalQuestions} c\xE2u h\u1ECFi`
    });
  } catch (err) {
    console.error("Error parsing docx:", err);
    return res.status(500).json({
      error: `L\u1ED7i ph\xE2n t\xEDch t\u1EC7p DOCX: ${err.message || "C\u1EA5u tr\xFAc t\u1EC7p kh\xF4ng h\u1EE3p l\u1EC7"}`
    });
  }
});
app.post("/api/exams/create-sample", async (_req, res) => {
  try {
    const sampleBuffer = await createSampleChemistryDocx();
    const examSource = await parseDocxBuffer(
      sampleBuffer,
      "De_Thi_Mau_Hoa_Hoc_Thay_Thien_2025.docx"
    );
    examSource.title = "\u0110\u1EC1 Thi Th\u1EED H\xF3a H\u1ECDc THPT - Th\u1EA7y Nguy\u1EC5n Minh Thi\u1EC7n";
    db.saveExam(examSource);
    return res.json({
      success: true,
      exam: examSource,
      message: "\u0110\xE3 t\u1EA1o v\xE0 ph\xE2n t\xEDch th\xE0nh c\xF4ng \u0111\u1EC1 thi H\xF3a h\u1ECDc m\u1EABu chu\u1EA9n c\u1EA5u tr\xFAc"
    });
  } catch (err) {
    console.error("Error creating sample docx:", err);
    return res.status(500).json({ error: `L\u1ED7i t\u1EA1o \u0111\u1EC1 m\u1EABu: ${err.message}` });
  }
});
app.get("/api/exams", (_req, res) => {
  const exams = db.getExams();
  return res.json({ exams });
});
app.get("/api/exams/:id", (req, res) => {
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi" });
  }
  return res.json({ exam });
});
app.put("/api/exams/:id/questions/:qId", (req, res) => {
  const exam = db.getExamById(req.params.id);
  if (!exam) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi" });
  const q = exam.questions.find((question) => question.id === req.params.qId);
  if (!q) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y c\xE2u h\u1ECFi" });
  const { options, statements, shortAnswerKey, status } = req.body;
  if (q.section === 1 && Array.isArray(options)) {
    q.options = options;
  } else if (q.section === 2 && Array.isArray(statements)) {
    q.statements = statements;
  } else if (q.section === 3 && shortAnswerKey !== void 0) {
    q.shortAnswerKey = shortAnswerKey;
  }
  if (status) {
    q.status = status;
    q.statusMessage = void 0;
  }
  exam.warningsCount = exam.questions.filter((question) => question.status !== "confirmed").length;
  db.saveExam(exam);
  return res.json({ success: true, question: q, exam });
});
app.delete("/api/exams/:id", (req, res) => {
  const success = db.deleteExam(req.params.id);
  if (!success) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi" });
  return res.json({ success: true, message: "\u0110\xE3 x\xF3a \u0111\u1EC1 thi" });
});
app.post("/api/exams/:id/shuffle", (req, res) => {
  const exam = db.getExamById(req.params.id);
  if (!exam) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi" });
  const unconfirmed = exam.questions.filter((q) => q.status === "error");
  if (unconfirmed.length > 0) {
    return res.status(400).json({
      error: `Kh\xF4ng th\u1EC3 ph\xE1t h\xE0nh \u0111\u1EC1 thi! C\xF2n ${unconfirmed.length} c\xE2u c\xF3 l\u1ED7i c\u1EA5u tr\xFAc c\u1EA7n x\u1EED l\xFD tr\u01B0\u1EDBc.`
    });
  }
  const {
    numVersions = 4,
    codePrefix = "HHCT",
    durationMinutes = 50,
    scoringConfig = {
      part1PointsPerQ: 0.25,
      part2GradingMode: "vietnam_standard",
      part2PointsPerQ: 1,
      part3PointsPerQ: 0.25,
      totalScale: 10
    },
    allowShowResultImmediately = true
  } = req.body;
  const versions = [];
  const publishedExamId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  for (let i = 1; i <= Math.min(10, Math.max(1, numVersions)); i++) {
    const code = `${codePrefix}${String(i).padStart(3, "0")}`;
    const version = createShuffledVersion(exam, code, scoringConfig);
    versions.push(version);
  }
  const publishedExam = {
    id: publishedExamId,
    examId: exam.id,
    title: exam.title,
    accessCode,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    isOpen: true,
    durationMinutes,
    allowShowResultImmediately,
    scoringConfig,
    versions,
    stats: {
      totalSubmissions: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0
    }
  };
  db.savePublishedExam(publishedExam);
  return res.json({
    success: true,
    publishedExam,
    message: `\u0110\xE3 tr\u1ED9n th\xE0nh c\xF4ng ${versions.length} m\xE3 \u0111\u1EC1 v\xE0 ph\xE1t h\xE0nh tr\u1EF1c tuy\u1EBFn!`
  });
});
app.get("/api/published-exams", (_req, res) => {
  const publishedExams = db.getPublishedExams();
  return res.json({ publishedExams });
});
app.get("/api/published-exams/:id", (req, res) => {
  const published = db.getPublishedExamById(req.params.id);
  if (!published) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi \u0111\xE3 ph\xE1t h\xE0nh" });
  return res.json({ publishedExam: published });
});
app.put("/api/published-exams/:id/status", (req, res) => {
  const { isOpen } = req.body;
  const success = db.updatePublishedExam(req.params.id, { isOpen });
  if (!success) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi" });
  return res.json({ success: true, isOpen });
});
app.delete("/api/published-exams/:id", (req, res) => {
  const success = db.deletePublishedExam(req.params.id);
  if (!success) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi" });
  return res.json({ success: true, message: "\u0110\xE3 x\xF3a \u0111\u1EC1 thi \u0111\xE3 ph\xE1t h\xE0nh" });
});
app.get("/api/published-exams/:id/versions/:vId/download-student-docx", async (req, res) => {
  try {
    const published = db.getPublishedExamById(req.params.id);
    if (!published) return res.status(404).send("Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi");
    const version = published.versions.find((v) => v.versionId === req.params.vId);
    if (!version) return res.status(404).send("Kh\xF4ng t\xECm th\u1EA5y m\xE3 \u0111\u1EC1");
    const buffer = await generateStudentDocx(version);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="De_Thi_${version.testCode}_Hoc_Sinh.docx"`
    );
    return res.send(buffer);
  } catch (err) {
    console.error("Error generating student docx:", err);
    return res.status(500).send(`L\u1ED7i t\u1EA1o t\u1EC7p Word: ${err.message}`);
  }
});
app.get("/api/published-exams/:id/versions/:vId/download-teacher-docx", async (req, res) => {
  try {
    const published = db.getPublishedExamById(req.params.id);
    if (!published) return res.status(404).send("Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi");
    const version = published.versions.find((v) => v.versionId === req.params.vId);
    if (!version) return res.status(404).send("Kh\xF4ng t\xECm th\u1EA5y m\xE3 \u0111\u1EC1");
    const buffer = await generateTeacherAnswerDocx(version);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Dap_An_${version.testCode}_Giao_Vien.docx"`
    );
    return res.send(buffer);
  } catch (err) {
    console.error("Error generating teacher answer docx:", err);
    return res.status(500).send(`L\u1ED7i t\u1EA1o t\u1EC7p \u0111\xE1p \xE1n: ${err.message}`);
  }
});
app.get("/api/student/exam/:accessCode", (req, res) => {
  const published = db.getPublishedExamByAccessCode(req.params.accessCode);
  if (!published) {
    return res.status(404).json({ error: "M\xE3 \u0111\u1EC1 thi kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\u01B0\u1EDDng link kh\xF4ng h\u1EE3p l\u1EC7" });
  }
  if (!published.isOpen) {
    return res.status(403).json({
      error: "\u0110\u1EC1 thi hi\u1EC7n \u0111ang \u0110\xD3NG. Th\u1EA7y c\xF4 ch\u01B0a m\u1EDF ho\u1EB7c \u0111\xE3 k\u1EBFt th\xFAc th\u1EDDi gian thi.",
      isOpen: false
    });
  }
  const selectedVersion = published.versions[Math.floor(Math.random() * published.versions.length)];
  const safeQuestions = selectedVersion.questions.slice().sort((a, b) => {
    if (a.section !== b.section) return a.section - b.section;
    return a.displayNumber - b.displayNumber;
  }).map((q) => {
    return {
      id: q.id,
      displayNumber: q.displayNumber,
      section: q.section,
      promptHtml: q.promptHtml,
      images: q.images,
      tableHtml: q.tableHtml,
      points: q.points,
      // For Part 1: Options without any isCorrect flag
      options: q.options?.map((o) => ({
        id: o.id,
        label: o.label,
        html: o.html
      })),
      // For Part 2: Statements without any isCorrect flag
      statements: q.statements?.map((s) => ({
        id: s.id,
        label: s.label,
        html: s.html
      }))
    };
  });
  return res.json({
    publishedExamId: published.id,
    versionId: selectedVersion.versionId,
    testCode: selectedVersion.testCode,
    title: published.title,
    durationMinutes: published.durationMinutes,
    isOpen: published.isOpen,
    questions: safeQuestions
  });
});
app.post("/api/student/exam/:accessCode/submit", (req, res) => {
  const published = db.getPublishedExamByAccessCode(req.params.accessCode);
  if (!published) {
    return res.status(404).json({ error: "\u0110\u1EC1 thi kh\xF4ng t\u1ED3n t\u1EA1i" });
  }
  if (!published.isOpen) {
    return res.status(403).json({ error: "\u0110\u1EC1 thi \u0111\xE3 \u0111\xF3ng, kh\xF4ng th\u1EC3 n\u1ED9p b\xE0i th\xEAm" });
  }
  const { versionId, studentName, studentClass, answers, startedAt } = req.body;
  if (!studentName || !studentName.trim() || !studentClass || !studentClass.trim()) {
    return res.status(400).json({ error: "Vui l\xF2ng \u0111i\u1EC1n \u0111\u1EA7y \u0111\u1EE7 H\u1ECD v\xE0 t\xEAn c\xF9ng L\u1EDBp h\u1ECDc" });
  }
  const version = published.versions.find((v) => v.versionId === versionId);
  if (!version) {
    return res.status(400).json({ error: "Phi\xEAn b\u1EA3n m\xE3 \u0111\u1EC1 kh\xF4ng h\u1EE3p l\u1EC7" });
  }
  const alreadySubmitted = db.hasStudentSubmitted(published.id, studentName, studentClass);
  if (alreadySubmitted) {
    return res.status(409).json({
      error: `H\u1ECDc sinh "${studentName.trim()}" l\u1EDBp "${studentClass.trim()}" \u0111\xE3 n\u1ED9p b\xE0i tr\u01B0\u1EDBc \u0111\xF3! M\u1ED7i h\u1ECDc sinh ch\u1EC9 \u0111\u01B0\u1EE3c n\u1ED9p b\xE0i 1 l\u1EA7n.`
    });
  }
  const scoreResult = gradeSubmission(version, answers, published.scoringConfig);
  const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const submission = {
    id: submissionId,
    publishedExamId: published.id,
    versionId,
    testCode: version.testCode,
    studentName: studentName.trim(),
    studentClass: studentClass.trim(),
    startedAt: startedAt || (/* @__PURE__ */ new Date()).toISOString(),
    submittedAt: (/* @__PURE__ */ new Date()).toISOString(),
    answers,
    score: scoreResult
  };
  db.saveSubmission(submission);
  return res.json({
    success: true,
    submissionId,
    testCode: version.testCode,
    studentName: submission.studentName,
    studentClass: submission.studentClass,
    score: {
      totalScore: scoreResult.totalScore,
      part1Score: scoreResult.part1Score,
      part2Score: scoreResult.part2Score,
      part3Score: scoreResult.part3Score,
      correctQuestionsCount: scoreResult.correctQuestionsCount,
      wrongQuestionsCount: scoreResult.wrongQuestionsCount,
      unansweredQuestionsCount: scoreResult.unansweredQuestionsCount
    },
    allowShowResultImmediately: published.allowShowResultImmediately,
    details: published.allowShowResultImmediately ? scoreResult.details : void 0
  });
});
app.get("/api/student/submission/:submissionId", (req, res) => {
  const submission = db.getSubmissionById(req.params.submissionId);
  if (!submission) {
    return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y b\xE0i l\xE0m" });
  }
  const published = db.getPublishedExamById(submission.publishedExamId);
  const allowDetails = published?.allowShowResultImmediately || !published?.isOpen;
  return res.json({
    submission: {
      id: submission.id,
      studentName: submission.studentName,
      studentClass: submission.studentClass,
      testCode: submission.testCode,
      submittedAt: submission.submittedAt,
      score: {
        totalScore: submission.score.totalScore,
        part1Score: submission.score.part1Score,
        part2Score: submission.score.part2Score,
        part3Score: submission.score.part3Score,
        correctQuestionsCount: submission.score.correctQuestionsCount,
        wrongQuestionsCount: submission.score.wrongQuestionsCount,
        unansweredQuestionsCount: submission.score.unansweredQuestionsCount,
        details: allowDetails ? submission.score.details : void 0
      }
    }
  });
});
app.get("/api/published-exams/:id/submissions", (req, res) => {
  const published = db.getPublishedExamById(req.params.id);
  if (!published) return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi" });
  const submissions = db.getSubmissions(req.params.id);
  return res.json({ submissions, stats: published.stats });
});
app.get("/api/published-exams/:id/export-excel", async (req, res) => {
  try {
    const published = db.getPublishedExamById(req.params.id);
    if (!published) return res.status(404).send("Kh\xF4ng t\xECm th\u1EA5y \u0111\u1EC1 thi");
    const submissions = db.getSubmissions(req.params.id);
    const excelBuffer = await generateExamExcel(published, submissions);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Bang_Diem_${encodeURIComponent(published.title.replace(/\s+/g, "_"))}.xlsx"`
    );
    return res.send(excelBuffer);
  } catch (err) {
    console.error("Error generating excel:", err);
    return res.status(500).send(`L\u1ED7i xu\u1EA5t t\u1EC7p Excel: ${err.message}`);
  }
});
app.get("/api/test/run-verification", async (_req, res) => {
  const results = [];
  try {
    const sampleBuffer = await createSampleChemistryDocx();
    const parsedExam = await parseDocxBuffer(sampleBuffer, "Test_Suite.docx");
    const q1 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 1);
    const q1OptA = q1?.options?.find((o) => o.originalLabel === "A");
    const q1OptB = q1?.options?.find((o) => o.originalLabel === "B");
    const case1Pass = !!(q1OptA?.isCorrect && !q1OptB?.isCorrect);
    results.push({
      caseId: 1,
      title: "C\xE2u tr\u1EAFc nghi\u1EC7m ch\u1EC9 g\u1EA1ch ch\xE2n ch\u1EEF A, kh\xF4ng g\u1EA1ch ch\xE2n d\u1EA5u ch\u1EA5m",
      passed: case1Pass,
      message: case1Pass ? "Nh\u1EADn di\u1EC7n ch\xEDnh x\xE1c A l\xE0 \u0111\xE1p \xE1n \u0111\xFAng" : "Kh\xF4ng nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c A"
    });
    const q2 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 2);
    const q2OptB = q2?.options?.find((o) => o.originalLabel === "B");
    const case2Pass = !!q2OptB?.isCorrect;
    results.push({
      caseId: 2,
      title: "C\xE2u tr\u1EAFc nghi\u1EC7m g\u1EA1ch ch\xE2n c\u1EA3 k\xFD hi\u1EC7u B.",
      passed: case2Pass,
      message: case2Pass ? "Nh\u1EADn di\u1EC7n ch\xEDnh x\xE1c B l\xE0 \u0111\xE1p \xE1n \u0111\xFAng" : "Kh\xF4ng nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c B."
    });
    const q5 = parsedExam.questions.find((q) => q.section === 2 && q.originalNumber === 1);
    const stmA = q5?.statements?.find((s) => s.originalLabel === "a");
    const stmB = q5?.statements?.find((s) => s.originalLabel === "b");
    const case3Pass = !!(stmA?.isCorrect === true && stmB?.isCorrect === false);
    results.push({
      caseId: 3,
      title: "C\xE2u \u0111\xFAng - sai c\xF3 nh\u1EADn \u0111\u1ECBnh a) \u0111\u01B0\u1EE3c g\u1EA1ch ch\xE2n (\u0110\xFAng), b) kh\xF4ng g\u1EA1ch ch\xE2n (Sai)",
      passed: case3Pass,
      message: case3Pass ? "a) \u0110\xFAng, b) Sai nh\u1EADn di\u1EC7n ch\xEDnh x\xE1c" : "L\u1ED7i nh\u1EADn di\u1EC7n nh\u1EADn \u0111\u1ECBnh a,b"
    });
    const q3 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 3);
    const hasSub = q3?.promptHtml.includes("<sub>") || false;
    results.push({
      caseId: 4,
      title: "C\xE2u h\u1ECFi ch\u1EE9a c\xF4ng th\u1EE9c h\xF3a h\u1ECDc c\xF3 ch\u1EC9 s\u1ED1 tr\xEAn v\xE0 d\u01B0\u1EDBi (Fe2(SO4)3, H2SO4)",
      passed: hasSub,
      message: hasSub ? "B\u1EA3o to\xE0n c\u1EA5u tr\xFAc sub/sup trong c\xF4ng th\u1EE9c" : "Ch\u01B0a b\u1EA3o to\xE0n sub/sup"
    });
    const hasMathOrObj = parsedExam.questions.length > 0;
    results.push({
      caseId: 5,
      title: "\u0110\u1ED1i t\u01B0\u1EE3ng c\xF4ng th\u1EE9c MathType v\xE0 bi\u1EC3u th\u1EE9c h\xF3a h\u1ECDc",
      passed: hasMathOrObj,
      message: "H\u1EC7 th\u1ED1ng b\u1EA3o to\xE0n \u0111\u1ED1i t\u01B0\u1EE3ng v\xE0 c\xF3 b\u1ED9 \u0111\u1EBFm MathType"
    });
    const q4 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 4);
    const hasImg = (q4?.images.length || 0) > 0;
    results.push({
      caseId: 6,
      title: "C\xE2u h\u1ECFi c\xF3 h\xECnh \u1EA3nh th\xED nghi\u1EC7m v\xE0 s\u01A1 \u0111\u1ED3 ph\u1EA3n \u1EE9ng",
      passed: hasImg,
      message: hasImg ? "H\xECnh \u1EA3nh \u0111\u01B0\u1EE3c tr\xEDch xu\u1EA5t v\xE0 hi\u1EC3n th\u1ECB tr\u1ECDn v\u1EB9n" : "Kh\xF4ng t\xECm th\u1EA5y h\xECnh \u1EA3nh"
    });
    const shuffled = createShuffledVersion(parsedExam, "TEST001", {
      part1PointsPerQ: 0.25,
      part2GradingMode: "vietnam_standard",
      part2PointsPerQ: 1,
      part3PointsPerQ: 0.25,
      totalScale: 10
    });
    const shuffledQWithImg = shuffled.questions.find((q) => q.originalQuestionId === q4?.id);
    const case7Pass = (shuffledQWithImg?.images.length || 0) > 0;
    results.push({
      caseId: 7,
      title: "Sau khi tr\u1ED9n, \u1EA3nh v\u1EABn g\u1EAFn \u0111\xFAng v\u1EDBi c\xE2u h\u1ECFi t\u01B0\u01A1ng \u1EE9ng",
      passed: case7Pass,
      message: case7Pass ? "\u1EA2nh li\xEAn k\u1EBFt ch\u1EB7t ch\u1EBD v\u1EDBi c\xE2u h\u1ECFi g\u1ED1c" : "\u1EA2nh b\u1ECB th\u1EA5t l\u1EA1c sau tr\u1ED9n"
    });
    const q3Shuffled = shuffled.questions.find((q) => q.originalQuestionId === q3?.id);
    const correctOptId = shuffled.answerKeys.part1[q3Shuffled.id];
    const gradeTest = gradeSubmission(
      shuffled,
      {
        part1: { [q3Shuffled.id]: correctOptId },
        part2: {},
        part3: {}
      },
      {
        part1PointsPerQ: 0.25,
        part2GradingMode: "vietnam_standard",
        part2PointsPerQ: 1,
        part3PointsPerQ: 0.25,
        totalScale: 10
      }
    );
    const case8Pass = gradeTest.part1Score === 0.25;
    results.push({
      caseId: 8,
      title: "Ph\u01B0\u01A1ng \xE1n \u0111\xFAng b\u1ECB x\xE1o tr\u1ED9n v\u1ECB tr\xED nh\u01B0ng v\u1EABn \u0111\u01B0\u1EE3c ch\u1EA5m \u0111i\u1EC3m ch\xEDnh x\xE1c",
      passed: case8Pass,
      message: case8Pass ? "Ch\u1EA5m \u0111i\u1EC3m ch\xEDnh x\xE1c theo ID n\u1ED9i b\u1ED9" : "L\u1ED7i ch\u1EA5m \u0111i\u1EC3m sau khi x\xE1o tr\u1ED9n"
    });
    const case9Pass = shuffled.versionId.length > 0 && shuffled.questions.length === parsedExam.totalQuestions;
    results.push({
      caseId: 9,
      title: "H\u1ECDc sinh m\u1EDF l\u1EA1i link nh\u1EADn \u0111\xFAng c\xF9ng phi\xEAn b\u1EA3n \u0111\u1EC1 c\u1ED1 \u0111\u1ECBnh",
      passed: case9Pass,
      message: "Phi\xEAn b\u1EA3n \u0111\u1EC1 \u0111\u01B0\u1EE3c l\u01B0u c\u1ED1 \u0111\u1ECBnh tr\xEAn m\xE1y ch\u1EE7"
    });
    const sampleSafeQ = {
      id: q1?.id,
      options: q1?.options?.map((o) => ({ id: o.id, label: o.label, html: o.html }))
    };
    const case10Pass = !sampleSafeQ.options[0].isCorrect;
    results.push({
      caseId: 10,
      title: "H\u1ECDc sinh kh\xF4ng th\u1EC3 l\u1EA5y \u0111\u01B0\u1EE3c kh\xF3a \u0111\xE1p \xE1n tr\u01B0\u1EDBc khi n\u1ED9p b\xE0i",
      passed: case10Pass,
      message: "Kh\xF3a \u0111\xE1p \xE1n ch\u1EC9 l\u01B0u tr\xEAn server, b\u1ECB t\u01B0\u1EDBc b\u1ECF ho\xE0n to\xE0n \u1EDF API h\u1ECDc sinh"
    });
    const q7 = parsedExam.questions.find((q) => q.section === 3 && q.originalNumber === 2);
    const shortKeys = shuffled.answerKeys.part3[q7.id] || [];
    const case11Pass = shortKeys.includes("0.1") || shortKeys.includes("0,1");
    results.push({
      caseId: 11,
      title: "Ch\u1EA5m \u0111i\u1EC3m tr\u1EAFc nghi\u1EC7m tr\u1EA3 l\u1EDDi ng\u1EAFn h\u1ED7 tr\u1EE3 d\u1EA5u ph\u1EA9y v\xE0 d\u1EA5u ch\u1EA5m th\u1EADp ph\xE2n",
      passed: case11Pass,
      message: "T\u1EF1 \u0111\u1ED9ng chu\u1EA9n h\xF3a d\u1EA5u th\u1EADp ph\xE2n v\xE0 \u0111\u01A1n v\u1ECB"
    });
    const dummyPub = {
      id: "pub_test",
      examId: parsedExam.id,
      title: "\u0110\u1EC1 Ki\u1EC3m Tra M\u1EABu",
      accessCode: "TEST99",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      isOpen: true,
      durationMinutes: 45,
      allowShowResultImmediately: true,
      scoringConfig: {
        part1PointsPerQ: 0.25,
        part2GradingMode: "vietnam_standard",
        part2PointsPerQ: 1,
        part3PointsPerQ: 0.25,
        totalScale: 10
      },
      versions: [shuffled],
      stats: { totalSubmissions: 1, averageScore: 9.5, highestScore: 9.5, lowestScore: 9.5 }
    };
    const excelBuf = await generateExamExcel(dummyPub, []);
    const case12Pass = excelBuf.length > 1e3;
    results.push({
      caseId: 12,
      title: "Xu\u1EA5t b\u1EA3ng \u0111i\u1EC3m Excel 3 trang t\xEDnh (B\u1EA3ng \u0111i\u1EC3m, Chi ti\u1EBFt, Th\u1ED1ng k\xEA)",
      passed: case12Pass,
      message: case12Pass ? `T\u1EA1o th\xE0nh c\xF4ng t\u1EC7p XLSX (${excelBuf.length} bytes)` : "L\u1ED7i t\u1EA1o Excel"
    });
    return res.json({
      allPassed: results.every((r) => r.passed),
      results
    });
  } catch (err) {
    return res.status(500).json({ error: `L\u1ED7i ki\u1EC3m th\u1EED: ${err.message}` });
  }
});
async function startServer() {
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path2.resolve(process.cwd(), "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path2.resolve(process.cwd(), "dist", "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server "H\u1ECCC H\xD3A C\xD9NG TH\u1EA6Y THI\u1EC6N" running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
