"""QR decoding for rendered PDF pages."""
import json

import cv2
import numpy as np


def decode_qr(pages):
    detector = cv2.QRCodeDetector()
    for page in pages:
        image = np.frombuffer(page, dtype=np.uint8)
        decoded, _ = cv2.imdecode(image, cv2.IMREAD_COLOR), None
        if decoded is None:
            continue
        value, _, _ = detector.detectAndDecode(decoded)
        if not value:
            continue
        try:
            payload = json.loads(value)
            if payload.get("v") != 1:
                continue
            principal = str(payload["principal"]).replace(",", "")
            return {"fdr_number": str(payload["fdr"]), "bank_ifsc": str(payload["ifsc"]),
                    "principal_paise": round(float(principal) * 100), "issue_date": str(payload["issue"]),
                    "maturity_date": str(payload["maturity"]), "favouring": str(payload["fav"])}
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
    return None
