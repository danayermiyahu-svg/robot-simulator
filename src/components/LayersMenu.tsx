// src/components/LayersMenu.tsx

import { useState, useEffect } from 'react';
import { useTelemetryStore } from '../store';

interface LayersMenuProps {
  layers: {
    augmentation: boolean;
    symbology: boolean;
    horizon: boolean;
    compass: boolean;
    path: boolean;
    attitude: boolean;
    centerAttitude: boolean;
    predictive: boolean;
    hillOverlay: boolean;
  };
  setLayers: React.Dispatch<React.SetStateAction<{
    augmentation: boolean;
    symbology: boolean;
    horizon: boolean;
    compass: boolean;
    path: boolean;
    attitude: boolean;
    centerAttitude: boolean;
    predictive: boolean;
    hillOverlay: boolean;
  }>>;
}

export function LayersMenu({ layers, setLayers }: LayersMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState('main');
  const setLayerFlags = useTelemetryStore(s => s.setLayerFlags);
  useEffect(() => {
    setLayerFlags(layers.augmentation, layers.symbology);
  }, [layers.augmentation, layers.symbology, setLayerFlags]);

  const toggleLayer = (layerKey: keyof typeof layers, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setLayers(prev => {
      const nextVal = !prev[layerKey];
      const nextState = { ...prev, [layerKey]: nextVal };

      // כאשר לוחצים על שכבת על, מחילים את אותו המצב (פועל/כבוי) על כל תתי-השכבות שלה
      if (layerKey === 'augmentation') {
        nextState.predictive = nextVal;
        nextState.hillOverlay = nextVal;
      }
      if (layerKey === 'symbology') {
        nextState.horizon = false;
        nextState.compass = nextVal;
        nextState.path = nextVal;
        nextState.attitude = nextVal;
        nextState.centerAttitude = nextVal;
      }

      return nextState;
    });
  };

  return (
    <div className="absolute top-4 left-4 z-50 pointer-events-auto">
      
      <button 
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setActiveMenu('main');
        }}
        className="w-10 h-10 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center overflow-hidden"
      >
        <img 
          src="/Layers Button.png" 
          alt="Layers Menu" 
          className="w-4.5 h-4.5 object-contain"
        />
      </button>

      {isOpen && (
        <div className="absolute top-0 left-14 bg-black/80 text-white w-64 rounded-lg shadow-xl backdrop-blur-md select-none overflow-hidden" dir="ltr">
          
          {activeMenu === 'main' ? (
            <div className="p-4">              
              <div className="flex flex-col gap-2">
                <div 
                  className="flex items-center justify-between p-2 hover:bg-white/10 rounded cursor-pointer transition-colors"
                  onClick={() => setActiveMenu('augmentation')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none text-gray-400">›</span>
                    <span className="text-sm font-medium">Augmentation</span>
                  </div>
                  <button 
                    onClick={(e) => toggleLayer('augmentation', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.augmentation ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.augmentation ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>

                <div 
                  className="flex items-center justify-between p-2 hover:bg-white/10 rounded cursor-pointer transition-colors"
                  onClick={() => setActiveMenu('symbology')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none text-gray-400">›</span>
                    <span className="text-sm font-medium">Symbology</span>
                  </div>
                  <button 
                    onClick={(e) => toggleLayer('symbology', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.symbology ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.symbology ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          ) : activeMenu === 'augmentation' ? (
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3 border-b border-white/20 pb-2">
                <button onClick={() => setActiveMenu('main')} className="text-gray-400 hover:text-white transition-colors text-lg">‹</button>
                <p className="text-sm font-medium">Augmentation</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between p-2 hover:bg-white/10 rounded transition-colors">
                  <span className="text-sm text-gray-300">Predictive Path (Tracks)</span>
                  <button 
                    onClick={(e) => toggleLayer('predictive', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.predictive ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.predictive ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>

                {/* מתג חדש לשכבת סימון הגבעות */}
                <div className="flex items-center justify-between p-2 hover:bg-white/10 rounded transition-colors">
                  <span className="text-sm text-gray-300">Hill Overlay (Hills)</span>
                  <button 
                    onClick={(e) => toggleLayer('hillOverlay', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.hillOverlay ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.hillOverlay ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3 border-b border-white/20 pb-2">
                <button onClick={() => setActiveMenu('main')} className="text-gray-400 hover:text-white transition-colors text-lg">‹</button>
                <p className="text-sm font-medium">Symbology</p>
              </div>
              
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between p-2 hover:bg-white/10 rounded transition-colors">
                  <span className="text-sm text-gray-300">pitch & roll</span>
                  <button 
                    onClick={(e) => toggleLayer('attitude', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.attitude ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.attitude ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 hover:bg-white/10 rounded transition-colors">
                  <span className="text-sm text-gray-300">Center Indicator</span>
                  <button 
                    onClick={(e) => toggleLayer('centerAttitude', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.centerAttitude ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.centerAttitude ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 hover:bg-white/10 rounded transition-colors">
                  <span className="text-sm text-gray-300">Horizon</span>
                  <button 
                    onClick={(e) => toggleLayer('horizon', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.horizon ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.horizon ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 hover:bg-white/10 rounded transition-colors">
                  <span className="text-sm text-gray-300">Compass</span>
                  <button 
                    onClick={(e) => toggleLayer('compass', e)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${layers.compass ? 'bg-blue-500' : 'bg-gray-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${layers.compass ? 'right-5' : 'right-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}
          
        </div>
      )}
    </div>
  );
}