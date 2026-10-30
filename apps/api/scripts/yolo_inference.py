# -*- coding: utf-8 -*-
import argparse
import json
import os
import sys

# Keep Ultralytics runtime settings inside the project. This avoids permission
# and non-ASCII profile-path issues on Windows and remains portable elsewhere.
PROJECT_CONFIG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".ultralytics"))
os.environ.setdefault("YOLO_CONFIG_DIR", PROJECT_CONFIG_DIR)
os.makedirs(os.environ["YOLO_CONFIG_DIR"], exist_ok=True)

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Dictionary mapping Agrosight YOLO11 28 classes to Chinese agricultural terminology
DISEASE_TRANSLATIONS = {
    "Maize Blight": {
        "nameZh": "玉米大斑病",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "真菌性病害",
        "description": "病斑呈大梭形或长条形，灰褐色，多由大斑凸脐蠕孢菌引起，高温高湿易爆发。"
    },
    "Maize Rust": {
        "nameZh": "玉米锈病",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "真菌性病害",
        "description": "叶片表面散生夏孢子堆，呈黄褐色至红褐色隆起斑疹，后期散出红褐色粉末。"
    },
    "Maize Gray Leaf Spot": {
        "nameZh": "玉米灰斑病",
        "crop": "玉米",
        "riskLevel": "medium",
        "category": "真菌性病害",
        "description": "病斑多沿叶脉平行为矩形至窄长条形，灰色至浅黄褐色，后期叶片提早枯死。"
    },
    "Maize Healthy": {
        "nameZh": "健康玉米",
        "crop": "玉米",
        "riskLevel": "low",
        "category": "健康植株",
        "description": "植株长势健壮，叶面整洁无明显病斑或虫咬孔洞。"
    },
    "Tomato Healthy": {
        "nameZh": "健康番茄叶片",
        "crop": "番茄",
        "riskLevel": "low",
        "category": "健康植株",
        "description": "叶面脉络清晰，无叶斑、无卷叶或边缘焦枯现象。"
    },
    "Tomato Leaf Blight": {
        "nameZh": "番茄晚疫病（叶疫病）",
        "crop": "番茄",
        "riskLevel": "high",
        "category": "卵菌性病害",
        "description": "叶尖或边缘产生暗绿色水渍状病斑，潮湿时叶背迅速长出白色致密霉层，扩展极快。"
    },
    "Tomato Leaf Curl": {
        "nameZh": "番茄黄化曲叶病毒病（TYLCV）",
        "crop": "番茄",
        "riskLevel": "high",
        "category": "病毒性病害",
        "description": "由粉虱传播，植株节间矮缩，顶端叶片明显向上卷曲、发黄硬化，严重影响坐果。"
    },
    "Healthy Tea": {
        "nameZh": "健康茶树",
        "crop": "茶树",
        "riskLevel": "low",
        "category": "健康植株",
        "description": "芽叶舒展，色泽翠绿，未见斑点与刺吸害虫活动痕迹。"
    },
    "Tea Leaf Blight": {
        "nameZh": "茶树叶枯病",
        "crop": "茶树",
        "riskLevel": "medium",
        "category": "真菌性病害",
        "description": "多发生在老叶或成叶边缘，病斑由红褐色渐变为灰白色，散生细小黑粒。"
    },
    "Tomato Bacterial Floundering": {
        "nameZh": "番茄细菌性溃疡斑病",
        "crop": "番茄",
        "riskLevel": "high",
        "category": "细菌性病害",
        "description": "叶缘焦枯呈火烧状萎蔫，维管束褐变，果实可见鸟眼状白晕斑点。"
    },
    "Maize Abiotic Disease": {
        "nameZh": "玉米生理性/非侵染障碍",
        "crop": "玉米",
        "riskLevel": "medium",
        "category": "生理障碍",
        "description": "多因干旱、药害或微量元素失衡引发，无菌丝或孢子附着。"
    },
    "Maize Stripe Disease": {
        "nameZh": "玉米条纹矮缩病毒病",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "病毒性病害",
        "description": "灰飞虱传毒，叶脉间呈现黄白断续条纹，植株明显矮化抽穗困难。"
    },
    "Tomato Alternaria Diseases": {
        "nameZh": "番茄早疫病（轮纹斑病）",
        "crop": "番茄",
        "riskLevel": "high",
        "category": "真菌性病害",
        "description": "病斑呈黑褐色圆形或近圆形，边缘常具同心轮纹，潮湿时产生黑色霉状物。"
    },
    "Tomato Blossom End Rot": {
        "nameZh": "番茄脐腐病（生理缺钙）",
        "crop": "番茄",
        "riskLevel": "medium",
        "category": "生理障碍",
        "description": "果实幼果期顶部凹陷变黑变硬，呈皮革状，主因为水分失衡导致根系吸钙受阻。"
    },
    "Tomato Excess Nitrogen": {
        "nameZh": "番茄氮素过量障碍",
        "crop": "番茄",
        "riskLevel": "medium",
        "category": "营养失衡",
        "description": "茎秆徒长，叶色深绿肥厚甚至下卷，花器发育不良，坐果率下降。"
    },
    "Tomato Healthy Fruit": {
        "nameZh": "健康番茄果实",
        "crop": "番茄",
        "riskLevel": "low",
        "category": "健康果实",
        "description": "果实外表圆润光滑，着色均匀无脐腐或斑点。"
    },
    "Fall Armyworm": {
        "nameZh": "草地贪夜蛾（秋粘虫）",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "重大迁飞性害虫",
        "description": "幼虫食量巨大，蛀食心叶呈窗户纸状孔洞或整株破损，需及时化学防除。"
    },
    "Maize Armyworm Activity": {
        "nameZh": "玉米粘虫危害",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "咀嚼式害虫",
        "description": "幼虫啃食叶肉留下下表皮形成半透明白斑，严重时将叶片吃成缺刻甚至光秆。"
    },
    "Tomato Helicoverpa Armigera": {
        "nameZh": "棉铃虫（番茄蛀果蛾）",
        "crop": "番茄",
        "riskLevel": "high",
        "category": "蛀食性害虫",
        "description": "幼虫蛀入青果或花蕾内取食果肉，造成果实腐烂脱落，严重减产。"
    },
    "Rice Brown Planthopper": {
        "nameZh": "水稻褐飞虱",
        "crop": "水稻",
        "riskLevel": "high",
        "category": "刺吸性害虫",
        "description": "群集于稻丛基部刺吸汁液，受害田块往往出现枯死倒伏（俗称‘冒穿’）。"
    },
    "Healthy Rice": {
        "nameZh": "健康水稻",
        "crop": "水稻",
        "riskLevel": "low",
        "category": "健康植株",
        "description": "叶色青翠直立，无叶枯、胡麻斑或飞虱危害。"
    },
    "Tea Algal Leaf Spot": {
        "nameZh": "茶树红锈藻斑病",
        "crop": "茶树",
        "riskLevel": "medium",
        "category": "藻类病害",
        "description": "老叶正面出现橙红色或锈黄色毛毡状圆斑，后期褪色变为灰白色斑块。"
    },
    "Tea Helopeltis": {
        "nameZh": "茶角盲蝽危害",
        "crop": "茶树",
        "riskLevel": "medium",
        "category": "刺吸性害虫",
        "description": "成若虫刺吸茶树幼嫩芽叶，伤口初期水渍状，后变成褐色坏死枯斑。"
    },
    "Tea Red Spider": {
        "nameZh": "茶树红蜘蛛（害螨）",
        "crop": "茶树",
        "riskLevel": "medium",
        "category": "害螨",
        "description": "聚集在成叶叶背刺吸汁液，叶面呈现灰白或黄褐色细密小斑，叶质变脆。"
    },
    "Tea Green Mirid Bug": {
        "nameZh": "茶绿盲蝽",
        "crop": "茶树",
        "riskLevel": "medium",
        "category": "刺吸性害虫",
        "description": "刺吸幼嫩芽叶，叶片展开后形成大面积孔洞和破裂叶，影响名优茶制作。"
    },
    "Rice Hispa": {
        "nameZh": "水稻铁甲虫",
        "crop": "水稻",
        "riskLevel": "medium",
        "category": "食叶害虫",
        "description": "幼虫潜叶取食叶肉，成虫啃食叶表皮形成白色条斑，叶尖枯黄焦枯。"
    },
    "Rice Leaf Blast": {
        "nameZh": "水稻稻瘟病（叶瘟）",
        "crop": "水稻",
        "riskLevel": "high",
        "category": "真菌性病害",
        "description": "典型病斑呈梭形，两端有坏死线，中央灰白，边缘褐色，外有黄色晕圈。"
    },
    "Rice Brown Spot": {
        "nameZh": "水稻胡麻叶斑病",
        "crop": "水稻",
        "riskLevel": "medium",
        "category": "真菌性病害",
        "description": "病斑呈芝麻粒大小椭圆形，黄褐色至灰褐色，多发生于缺肥或早衰田块。"
    },
    # ---------------------------------------------------------------------------
    # 玉米 11 类病害模型（corn_disease_best.pt，由 L1742/corndisease 数据集训练）
    # ---------------------------------------------------------------------------
    "Blight": {
        "nameZh": "玉米大斑病",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "真菌性病害",
        "description": "病斑梭形或长条形，灰褐色至黑褐色，多由大斑凸脐蠕孢菌侵染，高湿寡照易流行。"
    },
    "brown_spot": {
        "nameZh": "玉米褐斑病",
        "crop": "玉米",
        "riskLevel": "medium",
        "category": "真菌性病害",
        "description": "叶片散生黄褐色至红褐色圆形小斑，后期病斑融合，多发生在高温高湿的喇叭口期。"
    },
    "corn_rust": {
        "nameZh": "玉米锈病",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "真菌性病害",
        "description": "叶片正反面散生黄褐色至红褐色隆起疱斑（夏孢子堆），后期破裂散出铁锈色粉末。"
    },
    "corn_smut": {
        "nameZh": "玉米黑穗病（黑粉病）",
        "crop": "玉米",
        "riskLevel": "medium",
        "category": "真菌性病害",
        "description": "病部形成灰白色至黑色肿瘤状菌瘿（病瘤），成熟后破裂散出黑粉状冬孢子。"
    },
    "downy_mildew": {
        "nameZh": "玉米霜霉病",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "真菌性病害",
        "description": "叶片沿叶脉产生黄绿相间条斑，叶背潮湿时可见灰白色霜状霉层，植株矮化黄化。"
    },
    "fall-armyworm-larva": {
        "nameZh": "草地贪夜蛾幼虫",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "重大迁飞性害虫",
        "description": "幼虫头部具倒Y形纹，取食心叶和叶肉呈窗纸状孔洞，严重时将叶片啃食殆尽。"
    },
    "grey_leaf_spot": {
        "nameZh": "玉米灰斑病",
        "crop": "玉米",
        "riskLevel": "medium",
        "category": "真菌性病害",
        "description": "病斑沿叶脉平行延伸呈矩形至窄长条形，灰褐色，后期多个病斑融合致叶片枯死。"
    },
    "healthy": {
        "nameZh": "健康玉米",
        "crop": "玉米",
        "riskLevel": "low",
        "category": "健康植株",
        "description": "植株长势健壮，叶片色泽正常，无明显病斑、霉层或虫蛀孔洞。"
    },
    "maize-streak-disease": {
        "nameZh": "玉米条纹矮缩病（条纹病毒病）",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "病毒性病害",
        "description": "叶脉间出现断续黄白色条纹或点线，植株矮化、叶色褪绿，由叶蝉等媒介传播病毒引起。"
    },
    "yellow-stem-borer": {
        "nameZh": "玉米螟（茎秆钻蛀害虫）",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "钻蛀性害虫",
        "description": "幼虫钻蛀茎秆、雌穗和穗柄，蛀孔周围可见虫粪，遇风易折茎，严重影响产量。"
    },
    "yellow-stem-borer-larva": {
        "nameZh": "玉米螟幼虫",
        "crop": "玉米",
        "riskLevel": "high",
        "category": "钻蛀性害虫",
        "description": "幼虫孵化后先啃食心叶和叶腋，后蛀入茎秆，呈透明窗纸状或排孔状危害状。"
    }
}

def main():
    parser = argparse.ArgumentParser(description="YOLO Crop Disease Inference")
    parser.add_argument("--image", required=True, help="Path to input crop leaf image")
    parser.add_argument("--model", required=True, help="Path to YOLO model .pt file")
    parser.add_argument("--output", required=True, help="Path to save annotated image")
    parser.add_argument("--conf", type=float, default=0.20, help="Confidence threshold")
    args = parser.parse_args()

    if not os.path.exists(args.image):
        print(json.dumps({"success": False, "error": f"Image not found: {args.image}"}, ensure_ascii=False))
        sys.exit(1)

    if not os.path.exists(args.model):
        print(json.dumps({"success": False, "error": f"Model not found: {args.model}"}, ensure_ascii=False))
        sys.exit(1)

    try:
        from ultralytics import YOLO
        import cv2
        from PIL import Image

        model = YOLO(args.model)

        # Open with PIL Image to support extensionless uploads from multer
        pil_img = Image.open(args.image)
        if pil_img.mode != 'RGB':
            pil_img = pil_img.convert('RGB')

        results = model.predict(source=pil_img, conf=args.conf, verbose=False)

        detections = []
        if len(results) > 0 and len(results[0].boxes) > 0:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls[0].item())
                label_en = model.names.get(cls_id, f"Class_{cls_id}")
                conf = float(box.conf[0].item())
                xyxy = [round(float(c), 1) for c in box.xyxy[0].tolist()]

                info = DISEASE_TRANSLATIONS.get(label_en, {
                    "nameZh": label_en,
                    "crop": "未知作物",
                    "riskLevel": "medium",
                    "category": "未知分类",
                    "description": "未收录分类"
                })

                detections.append({
                    "classId": cls_id,
                    "labelEn": label_en,
                    "labelZh": info["nameZh"],
                    "crop": info["crop"],
                    "category": info["category"],
                    "riskLevel": info["riskLevel"],
                    "description": info["description"],
                    "confidence": round(conf, 4),
                    "box": xyxy
                })

            detections.sort(key=lambda x: x["confidence"], reverse=True)

            annotated_frame = results[0].plot()
            os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
            cv2.imwrite(args.output, annotated_frame)
            annotated_saved = True
        else:
            annotated_saved = False

        if detections:
            top_detection = detections[0]
            detected = True
            top_disease = top_detection["labelZh"]
            top_confidence = top_detection["confidence"]
            overall_risk = "high" if any(d["riskLevel"] == "high" for d in detections) else top_detection["riskLevel"]
        else:
            detected = False
            top_disease = "未检出显著病害或处于健康状态"
            top_confidence = 0.0
            overall_risk = "low"

        response = {
            "success": True,
            "detected": detected,
            "modelName": os.path.basename(args.model),
            "detectionsCount": len(detections),
            "detections": detections,
            "topDisease": top_disease,
            "confidence": top_confidence,
            "riskLevel": overall_risk,
            "annotatedSaved": annotated_saved,
            "annotatedPath": os.path.abspath(args.output) if annotated_saved else None
        }

        print("__YOLO_RESULT_START__")
        print(json.dumps(response, ensure_ascii=False))
        print("__YOLO_RESULT_END__")

    except Exception as e:
        err_res = {
            "success": False,
            "error": str(e)
        }
        print("__YOLO_RESULT_START__")
        print(json.dumps(err_res, ensure_ascii=False))
        print("__YOLO_RESULT_END__")
        sys.exit(1)

if __name__ == "__main__":
    main()
