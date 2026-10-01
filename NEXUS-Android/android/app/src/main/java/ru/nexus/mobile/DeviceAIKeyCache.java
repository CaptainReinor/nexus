package ru.nexus.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only encrypted ciphertext is persisted; the key never enters the WebView or export. */
final class DeviceAIKeyCache {
    private static final String ALIAS="nexus.device.ai.v1";
    private final SharedPreferences preferences;
    DeviceAIKeyCache(Context context){preferences=context.getSharedPreferences("nexus-device-ai",Context.MODE_PRIVATE);}
    static String binding(String endpoint,String token) throws Exception {
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(new org.json.JSONArray().put(endpoint).put(token).toString().getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(digest,Base64.NO_WRAP);
    }
    private SecretKey encryptionKey() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(ALIAS)){
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(ALIAS,null);
    }
    String read(String binding) throws Exception {
        String encoded=preferences.getString("value","");if(encoded.isEmpty())return null;
        SecretKey key=encryptionKey();
        try {
            JSONObject envelope=new JSONObject(encoded);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Base64.decode(envelope.getString("iv"),Base64.NO_WRAP)));
            JSONObject value=new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
            String result=value.getString("key");
            return value.getInt("version")==1&&binding.equals(value.getString("binding"))&&valid(result)?result:null;
        }catch(Exception error){clear();return null;}
    }
    static boolean valid(String key){return key.matches("^sk-or-v1-[a-zA-Z0-9_-]{20,480}$");}
    void save(String binding,String key) throws Exception {
        if(!valid(key))throw new Exception("Сервер выдал неверный ключ OpenRouter.");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,encryptionKey());
        JSONObject value=new JSONObject().put("version",1).put("binding",binding).put("key",key);
        JSONObject envelope=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
            .put("data",Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        if(!preferences.edit().putString("value",envelope.toString()).commit())throw new Exception("Не удалось сохранить защищённый ключ AI.");
    }
    void clear(){preferences.edit().remove("value").commit();}
}
