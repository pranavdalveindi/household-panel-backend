"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const panel_controller_1 = require("./panel.controller");
const router = (0, express_1.Router)();
// All panel routes are read-only and protected by the authenticate middleware in index.ts
router.get('/summary', panel_controller_1.getPanelSummary);
router.get('/heatmap', panel_controller_1.getPanelHeatmap);
router.get('/region/:regionCode', panel_controller_1.getPanelRegion);
router.get('/unclassified', panel_controller_1.getPanelUnclassified);
exports.default = router;
