export function RunningEssentialsBanner() {
  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden group cursor-pointer bg-gray-900 aspect-square">
      <img
        src="https://contents.mediadecathlon.com/s1406071/k$94027af63aa2bdabdce68bd86545c2f4/defaut.webp?format=auto"
        alt="Running Essentials"
        loading='eager'
        fetchpriority='high'
        decoding='async'
        className="w-full h-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-black/20"></div>
      <div className="absolute bottom-6 left-4">
        <h3 className="text-white text-2xl font-bold leading-tight mb-3">
          Running
          <br />
          Essentials
        </h3>
        <span className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded flex items-center w-max">
          보러가기
        </span>
      </div>
    </div>
  );
}
