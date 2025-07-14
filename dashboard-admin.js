// 4.f) Generar certificado con tu función original
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
    try {
        // 1) Leer datos del usuario desde Firestore
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) throw new Error("Usuario no encontrado");
        const { name: userNameDB, rut, company, customID } = userSnap.data();

        // 2) Leer datos de la evaluación
        const evalSnap = await db.collection('evaluations').doc(evaluationID).get();
        if (!evalSnap.exists) throw new Error("Evaluación no encontrada");
        const evalData       = evalSnap.data();
        const evaluationName = evalData.name;
        const evaluationTime = evalData.timeEvaluation;
        const certificateTemplate = evalData.certificateTemplate;
        const evaluationIDNumber  = evalData.ID;

        // 3) Calcular año e ID dinámico
        const [d, m, y] = approvalDate.split('-');
        const year       = new Date(`${y}-${m}-${d}`).getFullYear();
        const certificateID = `${evaluationIDNumber}${customID}${year}`;

        // 4) Cargar plantilla base
        const tplBytes = await fetch(certificateTemplate).then(r => r.arrayBuffer());
        const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
        pdfDoc.registerFontkit(fontkit);

        // 5) Cargar e incrustar fuentes
        const monoBytes    = await fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer());
        const perpBytes    = await fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer());
        const perpItBytes  = await fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer());

        const monotypeFont       = await pdfDoc.embedFont(monoBytes);
        const perpetuaFont       = await pdfDoc.embedFont(perpBytes);
        const perpetuaItalicFont = await pdfDoc.embedFont(perpItBytes);

        // 6) Preparar página y dimensiones
        const page  = pdfDoc.getPages()[0];
        const { width, height } = page.getSize();

        // 7) Auxiliar: centrar texto
        const centerText = (txt, yPos, font, size) => {
            const wTxt = font.widthOfTextAtSize(txt, size);
            page.drawText(txt, {
                x: (width - wTxt) / 2,
                y: yPos,
                font,
                size,
                color: PDFLib.rgb(0,0,0)
            });
        };

        // 8) Auxiliar: envolver líneas
        const wrapText = (txt, font, size, maxW) => {
            const words = txt.split(' ');
            const lines = [];
            let line = '';
            for (const w of words) {
                const test = line ? line + ' ' + w : w;
                if (font.widthOfTextAtSize(test, size) <= maxW) {
                    line = test;
                } else {
                    lines.push(line);
                    line = w;
                }
            }
            if (line) lines.push(line);
            return lines;
        };

        // 9) Pintar todos los campos
        centerText(userNameDB,           height - 295, monotypeFont,       35);
        centerText(`RUT: ${rut}`,        height - 340, perpetuaItalicFont, 19);
        centerText(`Empresa: ${company}`,height - 360, perpetuaItalicFont, 19);

        // Nombre de la evaluación con wrap
        const maxW2 = width - 100;
        const lines = wrapText(evaluationName, monotypeFont, 34, maxW2);
        let y0 = height - 448;
        for (const l of lines) {
            centerText(l, y0, monotypeFont, 34);
            y0 -= 40;
        }

        // Campos fijos
        page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
            x: 147, y: height - 548, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
        });
        page.drawText(`Duración del Curso: ${evaluationTime}`, {
            x: 157, y: height - 562, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
        });
        page.drawText(`ID: ${certificateID}`, {
            x: 184, y: height - 576, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
        });

        // 10) Exportar y disparar descarga
        const pdfBytes = await pdfDoc.save();
        const blob     = new Blob([pdfBytes], { type: "application/pdf" });
        const link     = document.createElement("a");
        link.href      = URL.createObjectURL(blob);
        link.download  = `Certificado_${evaluationName}.pdf`;
        link.click();

    } catch (error) {
        console.error("Error generando certificado:", error);
        alert("No se pudo generar el certificado. Revisa la consola.");
    }
}
